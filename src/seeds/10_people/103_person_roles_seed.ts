import { Seeder } from "../seed-runner";

interface RoleRow {
    id_role: number;
}

interface FacultyRow {
    id_faculty: number;
}

export const seedPersonRoles: Seeder = {
    name: '10_people:person_roles',
    run: async (ds) => {
        // Buscamos el id_rol que queremos asignar
        const roleDoc = await ds.query<RoleRow[]>(
            `SELECT id_role
            FROM roles
            WHERE role_name = 'DOCENTE'
            LIMIT 1`,
        );

        if(!roleDoc.length) throw new Error('No se encontro el rol DOCENTE');

        const fcyt = await ds.query<FacultyRow[]>(
            `SELECT id_faculty
            FROM faculties
            WHERE lower(btrim(faculty_name)) = lower(btrim($1))
            LIMIT 1`,
            ['FCyT'],
        );

        if(!fcyt.length) throw new Error('No se encontro la facultad FCyT');

        const idRole = roleDoc[0].id_role;
        const idFaculty = fcyt[0].id_faculty;

        await ds.query(
            `INSERT INTO person_roles (ci_person, id_role, id_faculty)
            VALUES ($1, $2, $3)
            ON CONFLICT (ci_person, id_role, id_faculty) DO NOTHING`,
            ['9315951', idRole, idFaculty],
        );
    },
};
