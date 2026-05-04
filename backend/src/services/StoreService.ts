import { StoreRepository, StoreRow } from '../repositories/StoreRepository'
import { logAudit } from '../db'
import { userCanAccessStore } from '../utils/storeAccess'
import { NotFoundError, ForbiddenError, BadRequestError } from '../utils/errors'

export class StoreService {
  private repo = new StoreRepository()

  canManage(role: string) {
    return role === 'admin' || role === 'manager'
  }

  async listStores(filters: {
    userId: string
    role: string
    search?: string
    region?: string
    platform?: string
    page: number
    limit: number
    light: boolean
  }) {
    const canSeeAll = this.canManage(filters.role) || filters.role === 'viewer'
    const { items, total } = await this.repo.findAll({
      userId: filters.userId,
      canSeeAll,
      search: filters.search,
      region: filters.region,
      platform: filters.platform,
      page: filters.page,
      limit: filters.limit,
      light: filters.light,
    })
    return {
      items,
      total,
      page: filters.page,
      limit: filters.limit,
      totalPages: Math.ceil(total / filters.limit) || 1,
    }
  }

  async getStore(id: string, userId: string, role: string): Promise<StoreRow> {
    const store = await this.repo.findById(id)
    if (!store) throw new NotFoundError('商店不存在或无权访问')
    if (!this.canManage(role) && role !== 'viewer') {
      const canAccess = await userCanAccessStore(userId, id, role)
      if (!canAccess) throw new NotFoundError('商店不存在或无权访问')
    }
    return store
  }

  async createStore(body: Record<string, unknown>, currentUserId: string, role: string): Promise<StoreRow> {
    const {
      name, nameTh, description, platform = '抖音',
      userId: targetUserId, userIds, region, currency, currencySymbol,
      minPrice, maxPrice, targetAudience, brandPositioning, brandStrategy,
      categoryIds = [], status = 'active',
    } = body

    if (!name || typeof name !== 'string') throw new BadRequestError('商店名称不能为空')

    const canAssign = this.canManage(role)
    let storeUserId = canAssign && targetUserId ? String(targetUserId) : currentUserId

    if (canAssign && targetUserId && role === 'manager') {
      const targetUser = await this.repo.getUserById(String(targetUserId))
      if (!targetUser) throw new BadRequestError('目标用户不存在')
      if (targetUser.role !== 'operator' && targetUser.role !== 'user')
        throw new ForbiddenError('经理只能将店铺分配给运营或普通用户')
    }

    const created = await this.repo.createStore({
      name: String(name), nameTh: nameTh ? String(nameTh) : undefined,
      description: description ? String(description) : undefined,
      platform: platform ? String(platform) : '抖音',
      userId: storeUserId, region: region ? String(region) : undefined,
      currency: currency ? String(currency) : 'CNY',
      currencySymbol: currencySymbol ? String(currencySymbol) : '¥',
      minPrice: minPrice != null ? Number(minPrice) : null,
      maxPrice: maxPrice != null ? Number(maxPrice) : null,
      targetAudience: targetAudience ? String(targetAudience) : undefined,
      brandPositioning: brandPositioning ? String(brandPositioning) : undefined,
      brandStrategy: brandStrategy ? String(brandStrategy) : undefined,
      status: status ? String(status) : 'active',
    })

    if (Array.isArray(categoryIds) && categoryIds.length > 0) {
      await this.repo.attachCategories(created.id, categoryIds as string[])
    }
    if (canAssign && Array.isArray(userIds) && userIds.length > 0) {
      await this.repo.addAccessUsers(created.id, userIds as string[], storeUserId)
    }

    await logAudit({
      userId: storeUserId,
      action: 'create',
      entityType: 'store',
      entityId: created.id,
      details: JSON.stringify({ name, platform }),
    }).catch(() => {})

    return (await this.repo.findById(created.id))!
  }

  async updateStore(
    id: string,
    body: Record<string, unknown>,
    currentUserId: string,
    role: string
  ): Promise<StoreRow> {
    const canManage = this.canManage(role)
    const existing = await this.repo.findById(id)
    if (!existing) throw new NotFoundError('商店不存在或无权访问')
    if (!canManage) {
      const canAccess = await userCanAccessStore(currentUserId, id, role)
      if (!canAccess) throw new NotFoundError('商店不存在或无权访问')
    }

    const {
      name, nameTh, description, platform, status, region,
      currency, currencySymbol, minPrice, maxPrice,
      targetAudience, brandPositioning, brandStrategy,
      categoryIds, userId: targetUserId, userIds,
    } = body

    const updates: Record<string, unknown> = {}
    if (name !== undefined)              updates.name = name
    if (nameTh !== undefined)            updates.nameTh = nameTh
    if (description !== undefined)       updates.description = description
    if (platform !== undefined)          updates.platform = platform
    if (status !== undefined)            updates.status = status
    if (region !== undefined)            updates.region = region
    if (currency !== undefined)          updates.currency = currency
    if (currencySymbol !== undefined)    updates.currencySymbol = currencySymbol
    if (minPrice !== undefined)          updates.minPrice = minPrice
    if (maxPrice !== undefined)          updates.maxPrice = maxPrice
    if (targetAudience !== undefined)    updates.targetAudience = targetAudience
    if (brandPositioning !== undefined)  updates.brandPositioning = brandPositioning
    if (brandStrategy !== undefined)     updates.brandStrategy = brandStrategy

    if (canManage && targetUserId !== undefined) {
      if (role === 'manager') {
        const targetUser = await this.repo.getUserById(String(targetUserId))
        if (!targetUser) throw new BadRequestError('目标用户不存在')
        if (targetUser.role !== 'operator' && targetUser.role !== 'user')
          throw new ForbiddenError('经理只能将店铺分配给运营或普通用户')
      }
      updates.userId = targetUserId
    }

    const updated = await this.repo.updateStore(id, updates)

    if (Array.isArray(categoryIds)) {
      await this.repo.replaceCategories(id, categoryIds as string[])
    }
    if (canManage && Array.isArray(userIds)) {
      const ownerId = (updates.userId as string | undefined) ?? existing.userId
      await this.repo.replaceAccessUsers(id, userIds as string[], ownerId)
    }

    return (await this.repo.findById(id))!
  }

  async deleteStore(id: string, userId: string, role: string): Promise<void> {
    const isAdmin = role === 'admin'
    const store = await this.repo.findById(id)
    if (!store) throw new NotFoundError('商店不存在或无权访问')
    if (!isAdmin) {
      const canAccess = await userCanAccessStore(userId, id, role)
      if (!canAccess) throw new NotFoundError('商店不存在或无权访问')
      if (store.userId !== userId) throw new ForbiddenError('只有管理员可删除店铺')
    }
    await this.repo.deleteStore(id)
  }
}
