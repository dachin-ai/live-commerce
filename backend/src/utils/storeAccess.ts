/**
 * 店铺访问权限工具
 * 支持：1) stores.userId 归属人  2) user_store_access 多人可见
 */
import { dbGet } from '../db'

/** 用户是否可查看某店铺（admin/manager 看全部；operator/user 需为归属人或 access 表中有记录） */
export async function userCanAccessStore(
  userId: string,
  storeId: string,
  role: string
): Promise<boolean> {
  if (role === 'admin' || role === 'manager') return true
  const store = await dbGet<{ userId: string | null }>('SELECT userId FROM stores WHERE id = ?', [storeId])
  if (!store) return false
  if (store.userId === userId) return true
  const access = await dbGet<{ c: number }>(
    'SELECT COUNT(*) as c FROM user_store_access WHERE userId = ? AND storeId = ?',
    [userId, storeId]
  )
  return !!(access && access.c > 0)
}
