import { Test } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.module';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('signed.jwt.token'),
};

const mockRedis = {
  setex: jest.fn().mockResolvedValue('OK'),
  get: jest.fn().mockResolvedValue(null),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('register()', () => {
    it('hashes password and creates user, returns token', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
      });

      const result = await service.register('user@example.com', 'password123');

      expect(result.token).toBe('signed.jwt.token');
      const [createArg] = mockPrisma.user.create.mock.calls as unknown as [
        [{ data: { passwordHash: string } }],
      ];
      const createCall = createArg[0];
      // password must be hashed — never stored in plain text
      expect(createCall.data.passwordHash).not.toBe('password123');
      expect(
        await argon2.verify(createCall.data.passwordHash, 'password123'),
      ).toBe(true);
    });

    it('throws ConflictException if email already registered', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.register('taken@example.com', 'password123'),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login()', () => {
    it('returns a token when credentials are valid', async () => {
      const hash = await argon2.hash('correctpassword');
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        passwordHash: hash,
      });

      const result = await service.login('user@example.com', 'correctpassword');

      expect(result.token).toBe('signed.jwt.token');
    });

    it('throws UnauthorizedException for wrong password', async () => {
      const hash = await argon2.hash('correctpassword');
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        passwordHash: hash,
      });

      await expect(
        service.login('user@example.com', 'wrongpassword'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login('noone@example.com', 'password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('JWT payload contains sub (user id) and email', async () => {
      const hash = await argon2.hash('pass');
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-abc',
        email: 'me@example.com',
        passwordHash: hash,
      });

      await service.login('me@example.com', 'pass');

      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: 'user-abc',
        email: 'me@example.com',
      });
    });
  });
});
