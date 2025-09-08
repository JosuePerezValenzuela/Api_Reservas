import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { People } from './people.entity.js';

@Entity({ name: 'auth_people' })
export class AuthPeople {
    @PrimaryColumn({ name: 'id_person', type: 'varchar', length: 15 })
    idperson!: string; // FK a people.ci_person

    @OneToOne(() => People, (p) => p.auth, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'id_person', referencedColumnName: 'ciperson' })
    person!: People;

    @Column({ name: 'email', type: 'varchar', length: 254, unique: true })
    email!: string;

    @Column({ name: 'password_hash', type: 'text' })
    passwordHash!: string;

    @Column({ name: 'password_algo', type: 'varchar', length: 20, default: 'argon2id' })
    passwordAlgo!: string;

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive!: boolean;

    @Column({ name: 'is_locked', type: 'boolean', default: false })
    isLocked!: boolean;

    @Column({ name: 'failed_attempts', type: 'smallint', default: 0 })
    failedAttempts!: number;
}
