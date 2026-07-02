const { parsePagination, getPaginationMeta } = require('../../src/utils/pagination');

describe('Pagination Utilities Unit Tests', () => {
  describe('parsePagination()', () => {
    it('should return default page and limit when query is empty', () => {
      const { page, limit, offset } = parsePagination({});
      expect(page).toBe(1);
      expect(limit).toBe(20);
      expect(offset).toBe(0);
    });

    it('should parse page and limit correctly', () => {
      const { page, limit, offset } = parsePagination({ page: '3', limit: '15' });
      expect(page).toBe(3);
      expect(limit).toBe(15);
      expect(offset).toBe(30);
    });

    it('should fall back to defaults for invalid strings or negative values', () => {
      const { page, limit } = parsePagination({ page: '-5', limit: 'invalid' });
      expect(page).toBe(1);
      expect(limit).toBe(20);
    });

    it('should cap the limit parameter at 100 to protect server resources', () => {
      const { limit } = parsePagination({ limit: '250' });
      expect(limit).toBe(100);
    });
  });

  describe('getPaginationMeta()', () => {
    it('should build correct pagination metadata', () => {
      const meta = getPaginationMeta(85, 3, 20);
      expect(meta).toEqual({
        page: 3,
        limit: 20,
        total: 85,
        totalPages: 5,
      });
    });

    it('should return totalPages of 1 when there are no items', () => {
      const meta = getPaginationMeta(0, 1, 20);
      expect(meta.totalPages).toBe(1);
    });
  });
});
