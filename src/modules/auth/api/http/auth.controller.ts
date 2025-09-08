import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { LoginDto } from "./dto/login.dto";
import { AuthService } from "../../auth.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { Roles } from "../../../../common/roles/roles.decorator";
import { Role } from '../../../../common/roles/roles.enum';
import { RolesGuard } from "../../../../common/roles/roles.guard";
import type { Request } from "express";
import type { UserPayload } from "src/common/types/user-payload";

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly auth: AuthService) {}

    @Post('login')
    async login(@Body() dto: LoginDto) {
        return this.auth.login(dto.email, dto.password);
    }

    @Get('me')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    me(@Req() req: Request & { user: UserPayload }): UserPayload {
        return req.user;
    }

    @Get('only-docente')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.DOCENTE)
    onlyDocente() {
        return { ok: true, msg: 'Si ves esto, eres DOCENTE' };
    }
}