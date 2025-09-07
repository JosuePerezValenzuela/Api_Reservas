import { Role } from '../roles/roles.enum';

export interface UserPayload {
    sub: string;
    email: string;
    roles: Role[];
}
