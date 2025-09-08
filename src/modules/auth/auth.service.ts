import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as argon2 from 'argon2';
import { AuthPeople } from 'src/infra/db/typeorm/entities/auth-people.entity';
import { UserPayload } from '../../common/types/user-payload';
import { Role } from '../../common/roles/roles.enum';

export interface AccesTokenResponse { accessToken: string; }
@Injectable()
export class AuthService {

    constructor (
        private readonly jwt: JwtService,
        private readonly dataSource: DataSource,
        @InjectRepository(AuthPeople) private readonly authRepo: Repository<AuthPeople>,
    ) {}

    private normalizeEmail(email: string): string {
        return email.trim().toLowerCase();
    }

    // Buscamos el usuario por su email
    private async findAuthByEmail(email: string): Promise<AuthPeople | null> {
        return this.authRepo.findOne({
            where: { email: this.normalizeEmail(email) },
            relations: { person: true},
        });
    }

    // Verificar contrasenia con el algoritmo
    private async verifyPassword(hash: string, plain: string, algo: string): Promise<boolean> {
        if (algo === 'argon2') {
            return argon2.verify(hash, plain);
        }
        throw new Error(`Algoritmo de hash no soportado: ${algo}`);
    }

    // Traer roles y facultades del usuario
    private async loadRolesAndFaculties(ciPerson: string): Promise<{ roles: Role[], faculties: number[]; isGlobal: boolean }> {
        const rows: Array<{ role: string; id_faculty: number | null }> = await this.dataSource.query(
            `SELECT r.role_name AS role, pr.id_faculty 
            FROM person_roles pr 
            JOIN roles r ON pr.id_role = r.id_role 
            WHERE pr.ci_person = $1`,
            [ciPerson],
        );

        const roleSet = new Set<Role>();
        const facSet = new Set<number>();
        let isGlobal = false;
        for (const row of rows) {
            
            const name = row.role?.toUpperCase().replace(/\s+/g, '_') as keyof typeof Role;
            if (Role[name]) roleSet.add(Role[name]);

            if (row.id_faculty === null) {
                isGlobal = true;
            } else {
                facSet.add(row.id_faculty);
            }
        }

        return { roles: Array.from(roleSet), faculties: Array.from(facSet), isGlobal };
    }

    //Firma del token
    private async signAccessToken(payload: UserPayload): Promise<AccesTokenResponse> {
        const accessToken = await this.jwt.signAsync(payload);
        return { accessToken };
    }

    // Login
    async login(emailRaw: string, password: string): Promise<AccesTokenResponse> {
        const email = this.normalizeEmail(emailRaw);
        const auth = await this.findAuthByEmail(email);

        if(!auth) {
            throw new UnauthorizedException('Email o contrasenia incorrectos');
        }

        if (!auth.isActive) {
            throw new UnauthorizedException('Usuario inactivo, contacta al administrador');
        }

        const ok = await this.verifyPassword(auth.passwordHash, password, auth.passwordAlgo)
        if (!ok) {
            await this.authRepo.update({ idperson: auth.idperson }, { failedAttempts: () => 'failed_attempts + 1' });
            throw new UnauthorizedException('Credenciales invalidas');
        } else if (auth.failedAttempts > 0) {
            await this.authRepo.update({ idperson: auth.idperson }, { failedAttempts: 0 });
        }

        const { roles, faculties, isGlobal } = await this.loadRolesAndFaculties(auth.idperson);

        if (roles.length === 0) {
            throw new ForbiddenException('No tienes permisos para acceder a este recurso');
        }

        const payload: UserPayload = {
            sub: auth.idperson,
            email: auth.email,
            roles,
            faculties: faculties.length ? faculties : undefined,
            isGlobal: isGlobal || undefined,
        };

        return this.signAccessToken(payload);
    }
}
