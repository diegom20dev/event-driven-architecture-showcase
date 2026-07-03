import { MigrationInterface, QueryRunner } from "typeorm";

export class WinnerIdVarchar1782967491194 implements MigrationInterface {
    name = 'WinnerIdVarchar1782967491194'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // winner_id guarda un playerId (string libre), no un uuid. Cambio no destructivo.
        await queryRunner.query(
            `ALTER TABLE "matches" ALTER COLUMN "winner_id" TYPE character varying(64) USING "winner_id"::text`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // OJO: este rollback falla si existen winner_id que no sean UUID válidos
        // (que es justo el caso que esta migración habilita). Solo seguro si winner_id
        // está vacío o contiene UUIDs.
        await queryRunner.query(
            `ALTER TABLE "matches" ALTER COLUMN "winner_id" TYPE uuid USING "winner_id"::uuid`,
        );
    }

}
