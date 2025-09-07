import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from './roles.enum';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(ctx: ExecutionContext): boolean {
        // Lee los roles requeridos marcados por el decorador @Roles
        const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
            ctx.getHandler(),
            ctx.getClass(),
        ]);

        // Si no se necesita rol, se deja pasar
        if (!required || required.length == 0) {
            return true;
        }

        // Obtener el user del request
        interface RequestWithUser {
            user?: { roles?: Role[] };
        }
        const req = ctx.switchToHttp().getRequest<RequestWithUser>();
        const user = req.user;

        // Si no se tiene user o no viene lista de roles en el token
        if (!user?.roles) {
            throw new ForbiddenException('No tienes permisos para acceder a este recurso');
        }

        // El usuario tiene al menos un rol requerido
        const ok = required.some((role) => user.roles!.includes(role));
        if (!ok) {
            throw new ForbiddenException('No tienes permisos para acceder a este recurso');
        }
        return true;
    }
}
