import 'reflect-metadata';
import dataSource from '../../ormconfig';

export interface Seeder {
    name: string;
    run: (ds: typeof dataSource) => Promise<void>;
}

// Importación de los seeders
import { seedRoles } from './00_core/001_roles.seed';
import { seedFaculties } from './00_core/002_faculties.seed';
import { seedPeople } from './10_people/101_people.seed';
import { seedAuthPeople } from './10_people/102_auth_people.seed';
import { seedPersonRoles } from './10_people/103_person_roles_seed';

const ALL_SEEDERS: Seeder[] = [
    // Core primero
    seedRoles,
    seedFaculties,
    // Luego people
    seedPeople,
    seedAuthPeople,
    seedPersonRoles,
];

async function main() {
    const onlyArg = process.argv.find(a => a.startsWith('--only=='));
    const tagsArg = process.argv.find(a => a.startsWith('--tags=='));
    const only = onlyArg ? onlyArg.split('=')[1].split(',') : undefined;
    const tags = tagsArg ? tagsArg.split('=')[1].split(',') : undefined;

    await dataSource.initialize();

    console.log('Conectado a la base de datos \n');

    for (const s of ALL_SEEDERS) {
        if (only && !only.includes(s.name)) {
            continue;
        }
        if (tags && !tags.some(t => s.name.startsWith(t))) {
            continue;
        }

        console.log(` ${s.name}...`);
        try {
            await s.run(dataSource);
            console.log(` ${s.name} OK \n`);
        } catch (e) {
            console.error(` ${s.name} ERROR: `, e);
            try {
                await dataSource.destroy();
            } catch {}
            process.exit(1);
        }
    }

    await dataSource.destroy();
    console.log('Cargado correctamente');
}

main();