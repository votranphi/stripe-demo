import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { UserModel, UserRole } from '../models/user.model.js';
import {
  UserAlreadyExistsException,
  InvalidCredentialsException,
  DatabaseException,
  JWTSecretMissingException
} from '../errors/CustomError.js';

export interface RegisterInput {
  email: string;
  password: string;
  role?: UserRole;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResponse {
  userId: string;
  email: string;
  role: UserRole;
  token: string;
}

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

  async register(input: RegisterInput): Promise<AuthResponse> {
    try {
      // Check if user already exists
      const existingUser = await UserModel.findOne({ email: input.email });
      if (existingUser) {
        throw new UserAlreadyExistsException(input.email);
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(input.password, this.SALT_ROUNDS);

      // Create user
      const userDoc = new UserModel({
        id: crypto.randomUUID(),
        email: input.email,
        password: hashedPassword,
        role: input.role || UserRole.USER
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

  async login(input: LoginInput): Promise<AuthResponse> {
    try {
      // Find user by email
      const user = await UserModel.findOne({ email: input.email });
      if (!user) {
        throw new InvalidCredentialsException();
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(input.password, user.password);
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