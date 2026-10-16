import { Entity, PrimaryColumn, Column } from 'typeorm';
import { AdminRole } from '../types/jwt-types';

@Entity('admin')
export class Admin {
  @PrimaryColumn('uuid')
  admin_id!: string;

  @Column('varchar')
  first_name!: string;

  @Column('varchar')
  last_name!: string;

  @Column('varchar', { unique: true })
  email!: string;

  @Column('varchar')
  password_hash!: string;

  @Column('enum', { enum: AdminRole, enumName: 'admin_role' })
  role!: AdminRole;

  @Column('timestamp with time zone')
  created_at!: Date;
}
