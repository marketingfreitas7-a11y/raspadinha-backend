-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "telefone" TEXT,
  ADD COLUMN "cpf" TEXT;

-- CreateIndex (para garantir unicidade do CPF)
CREATE UNIQUE INDEX "User_cpf_key" ON "User"("cpf");
