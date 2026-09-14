import {
  Inject,
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { Role } from "./policy";
export type SessionStore = {
  refreshSession: { findUnique: (args: any) => Promise<any> };
};
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    @Inject("SESSION_STORE") private readonly store: SessionStore,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride("public", [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    )
      return true;
    const req = ctx.switchToHttp().getRequest();
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    try {
      const payload = await this.jwt.verifyAsync(token || "");
      const session = await this.store.refreshSession.findUnique({
        where: { id: payload.sid },
        include: { user: true },
      });
      if (
        !session ||
        session.revokedAt ||
        session.expiresAt < new Date() ||
        !session.user.active ||
        session.userId !== payload.sub
      )
        throw new Error();
      req.user = session.user;
      req.sessionId = session.id;
    } catch {
      throw new UnauthorizedException(
        "Your session has expired. Please sign in.",
      );
    }
    const roles = this.reflector.getAllAndOverride<Role[]>("roles", [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (roles && !roles.includes(req.user.role))
      throw new ForbiddenException("Your role cannot perform this action.");
    return true;
  }
}
