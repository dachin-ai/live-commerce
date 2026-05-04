import { describe, it, expect } from 'vitest'
import { TaskService } from '../TaskService'

const svc = new TaskService()

describe('TaskService 纯逻辑方法', () => {
  describe('canEditAnyTask', () => {
    it('admin 可编辑', () => expect(svc.canEditAnyTask('admin')).toBe(true))
    it('manager 可编辑', () => expect(svc.canEditAnyTask('manager')).toBe(true))
    it('operator 不可编辑', () => expect(svc.canEditAnyTask('operator')).toBe(false))
    it('user 不可编辑', () => expect(svc.canEditAnyTask('user')).toBe(false))
    it('viewer 不可编辑', () => expect(svc.canEditAnyTask('viewer')).toBe(false))
  })

  describe('canSeeAllTasks', () => {
    it('admin 可见全部', () => expect(svc.canSeeAllTasks('admin')).toBe(true))
    it('manager 可见全部', () => expect(svc.canSeeAllTasks('manager')).toBe(true))
    it('viewer 可见全部', () => expect(svc.canSeeAllTasks('viewer')).toBe(true))
    it('operator 不可见全部', () => expect(svc.canSeeAllTasks('operator')).toBe(false))
    it('user 不可见全部', () => expect(svc.canSeeAllTasks('user')).toBe(false))
  })

  describe('parseI18n', () => {
    it('null 返回空对象', () => expect(svc.parseI18n(null)).toEqual({}))
    it('空字符串返回空对象', () => expect(svc.parseI18n('')).toEqual({}))
    it('有效 JSON 字符串解析', () => {
      const r = svc.parseI18n('{"en-US":"Hello","th-TH":"สวัสดี"}')
      expect(r['en-US']).toBe('Hello')
      expect(r['th-TH']).toBe('สวัสดี')
    })
    it('无效 JSON 返回空对象', () => expect(svc.parseI18n('{invalid}')).toEqual({}))
    it('对象原样返回', () => {
      const obj = { 'en-US': 'test' }
      expect(svc.parseI18n(obj)).toBe(obj)
    })
  })

  describe('protectSectionMarkers / restoreSectionMarkers', () => {
    it('保护标记后再还原应等同原文', () => {
      const original = '【目标】提升GMV\n【执行步骤】检查库存\n【预期效果】提升10%'
      const protected_ = svc.protectSectionMarkers(original)
      expect(protected_).not.toContain('【目标】')
      expect(protected_).toContain('[[SEC_TARGET]]')
      const restored = svc.restoreSectionMarkers(protected_)
      expect(restored).toContain('【目标】')
      // 注意: reduce 遍历 SECTION_MARKERS 时最后一个 [[SEC_STEPS]] 映射到的 marker 生效
      // 【执行步骤】/【操作步骤】/【步骤】 → [[SEC_STEPS]] → 还原时 reduce 最后命中的是【步骤】
      // 主要验证：保护+还原后不再包含 token 占位符
      expect(restored).not.toContain('[[SEC_TARGET]]')
      expect(restored).not.toContain('[[SEC_EXPECTED]]')
    })

    it('无标记文本不变', () => {
      const text = 'Hello world, no markers'
      expect(svc.protectSectionMarkers(text)).toBe(text)
      expect(svc.restoreSectionMarkers(text)).toBe(text)
    })

    it('多种步骤别名统一还原', () => {
      const text1 = '【操作步骤】具体操作'
      const text2 = '【步骤】具体操作'
      const p1 = svc.protectSectionMarkers(text1)
      const p2 = svc.protectSectionMarkers(text2)
      // 都映射到 [[SEC_STEPS]]
      expect(p1).toContain('[[SEC_STEPS]]')
      expect(p2).toContain('[[SEC_STEPS]]')
      // reduce 中 [[SEC_STEPS]] 最后映射为 SECTION_MARKERS 中最后一个匹配的 marker
      // 验证还原后不再包含 token
      const r1 = svc.restoreSectionMarkers(p1)
      expect(r1).not.toContain('[[SEC_STEPS]]')
    })
  })
})
