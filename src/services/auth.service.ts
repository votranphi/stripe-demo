import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { UserModel, UserRole } from '../models/user.model.js';
import {
  UserAlreadyExistsException,
  InvalidCredentialsException,
  DatabaseException,
  JWTSecretMissingException
} from '../errors/CustomError.js';

export class AuthService {
  private readonly SALT_ROUNDS = 10;
  private readonly JWT_SECRET: string;
  private readonly JWT_EXPIRES_IN: string;

  constructor() {
    this.JWT_SECRET = process.env.JWT_SECRET || '';
    this.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

    if (!this.JWT_SECRET) {
      throw new JWTSecretMissingException();
    }
  }

  async register(email: string, password: string, role?: UserRole): Promise<{ userId: string; email: string; role: UserRole; token: string }> {
    try {
      // Check if user already exists
      const existingUser = await UserModel.findOne({ email });
      if (existingUser) {
        throw new UserAlreadyExistsException(email);
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, this.SALT_ROUNDS);

      // Create user ID
      const userId = crypto.randomUUID();

      // Create user (draft order will be created lazily when needed)
      const userDoc = new UserModel({
        id: userId,
        email,
        password: hashedPassword,
        role: role || UserRole.USER
      });

      await userDoc.save();

      // Generate JWT
      const token = this.generateToken(userDoc.id, userDoc.role);

      return {
        userId: userDoc.id,
        email: userDoc.email,
        role: userDoc.role,
        token
      };
    } catch (error) {
      if (error instanceof UserAlreadyExistsException) {
        throw error;
      }
      throw new DatabaseException('register user', error instanceof Error ? error : undefined);
    }
  }

  async login(email: string, password: string): Promise<{ userId: string; email: string; role: UserRole; token: string }> {
    try {
      // Find user by email
      const user = await UserModel.findOne({ email });
      if (!user) {
        throw new InvalidCredentialsException();
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new InvalidCredentialsException();
      }

      // Generate JWT
      const token = this.generateToken(user.id, user.role);

      return {
        userId: user.id,
        email: user.email,
        role: user.role,
        token
      };
    } catch (error) {
      if (error instanceof InvalidCredentialsException) {
        throw error;
      }
      throw new DatabaseException('login user', error instanceof Error ? error : undefined);
    }
  }

  verifyToken(token: string): { userId: string; role: UserRole } {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET) as { userId: string; role: UserRole };
      return decoded;
    } catch (error) {
      throw new InvalidCredentialsException();
    }
  }

  private generateToken(userId: string, role: UserRole): string {
    return jwt.sign(
      { userId, role },
      this.JWT_SECRET,
      { expiresIn: '24h' } // this one must be loaded from .env (there's a bug if I just the line above, I'll fix it later)
    );
  }
}