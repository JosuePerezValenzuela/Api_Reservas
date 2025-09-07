import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserPayload } from '../../common/types/user-payload';
import { Role } from '../../common/roles/roles.enum';

@Injectable()
export class AuthService {
    constructor(private readonly jwt: JwtService) {}

    async signAccessToken(payload: UserPayload) {
        const accessToken = await this.jwt.signAsync(payload);
        return { accessToken };
    }

    // “Login” de prueba: solo para verificar el flujo.
    async loginDummy(email: string) {
        const payload: UserPayload = {
            sub: '12345678', // luego será la CI real
            email: email.toLowerCase(),
            roles: [Role.DOCENTE], // luego vendrá de person_roles
        };
        return this.signAccessToken(payload);
    }
}
