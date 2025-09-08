import { Role } from '../roles/roles.enum';

export interface UserPayload {
    sub: string;
    email: string;
    roles: Role[];
    faculties?: number[]; // IDs de todas las facultades a las que pertenece
    isGlobal?: boolean; // true si tiene un rol global id_faculty = NULL)
}
