import { describe, it, expect } from 'vitest'
import { AppError, BadRequestError, NotFoundError, ForbiddenError, UnauthorizedError, ValidationError } from '../../utils/errors'

describe('自定义异常类', () => {
  it('AppError 默认 500', () => {
    const e = new AppError('boom')
    expect(e.statusCode).toBe(500)
    expect(e.code).toBe('INTERNAL_ERROR')
    expect(e.message).toBe('boom')
    expect(e).toBeInstanceOf(Error)
  })

  it('BadRequestError 400', () => {
    const e = new BadRequestError('bad input')
    expect(e.statusCode).toBe(400)
    expect(e.code).toBe('BAD_REQUEST')
    expect(e).toBeInstanceOf(AppError)
  })

  it('UnauthorizedError 401', () => {
    const e = new UnauthorizedError()
    expect(e.statusCode).toBe(401)
    expect(e.code).toBe('UNAUTHORIZED')
  })

  it('ForbiddenError 403', () => {
    const e = new ForbiddenError('no access')
    expect(e.statusCode).toBe(403)
    expect(e.code).toBe('FORBIDDEN')
  })

  it('NotFoundError 404', () => {
    const e = new NotFoundError('资源不存在')
    expect(e.statusCode).toBe(404)
    expect(e.code).toBe('NOT_FOUND')
    expect(e.message).toBe('资源不存在')
  })

  it('ValidationError 422', () => {
    const e = new ValidationError('字段无效', { field: 'name' })
    expect(e.statusCode).toBe(422)
    expect(e.code).toBe('VALIDATION_ERROR')
    expect(e.details).toEqual({ field: 'name' })
  })

  it('details 可选', () => {
    const e = new AppError('test', 503, 'SERVICE_UNAVAILABLE')
    expect(e.details).toBeUndefined()
    expect(e.statusCode).toBe(503)
    expect(e.code).toBe('SERVICE_UNAVAILABLE')
  })
})
