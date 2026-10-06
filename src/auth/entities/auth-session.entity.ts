import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('auth_sessions')
@Index(['client_id'])
@Index(['refresh_token_hash'])
export class AuthSession {
  @PrimaryColumn('uuid')
  session_id!: string;

  @Column('uuid')
  client_id!: string;

  @Column('text')
  access_token_hash!: string;

  @Column('text')
  refresh_token_hash!: string;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  last_active!: Date;

  @Column('timestamp')
  access_expires_at!: Date;

  @Column('timestamp')
  refresh_expires_at!: Date;

  @Column('timestamp', { nullable: true })
  revoked_at?: Date | null;

  @Column('varchar', { nullable: true, length: 512 })
  device?: string;

  @Column('varchar', { nullable: true, length: 128 })
  location?: string;
}
