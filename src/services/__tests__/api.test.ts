import { CancelledError } from '@tanstack/query-core';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock('../../store/useStore', () => ({
  useStore: {
    getState: () => ({ setUser: jest.fn() }),
  },
}));

import { AuthAPI, ApiError, isAuthExpiredError } from '../api';

describe('api error handling', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('produces an ApiError with status 401 for a generic 401 response', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized: something else' }),
    })) as any;

    let caught: unknown;
    try {
      await AuthAPI.me();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(401);
  });

  it('isAuthExpiredError returns true for a 401 ApiError with AUTH_EXPIRED code', () => {
    const error = new ApiError('Your session expired', { status: 401, code: 'AUTH_EXPIRED' });
    expect(isAuthExpiredError(error)).toBe(true);
  });

  it('isAuthExpiredError returns true for a cancelled-request error (invalid/missing bearer token 401)', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid token' }),
    })) as any;

    let caught: unknown;
    try {
      await AuthAPI.me();
    } catch (error) {
      caught = error;
    }

    // Implementation converts this specific 401 case into a CancelledError instead of ApiError.
    expect(caught).toBeInstanceOf(CancelledError);
    expect(isAuthExpiredError(caught)).toBe(true);
  });

  it('isAuthExpiredError returns false for a generic Error', () => {
    expect(isAuthExpiredError(new Error('boom'))).toBe(false);
  });
});
