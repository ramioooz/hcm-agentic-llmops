CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "leave_policies" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "annual_allowance_days" INTEGER NOT NULL,
    "working_days" TEXT NOT NULL,
    "minimum_notice_working_days" INTEGER NOT NULL,
    "maximum_consecutive_working_days" INTEGER NOT NULL,
    "excludes_holidays" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "leave_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "leave_balances" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "leave_policy_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "allocated_days" INTEGER NOT NULL,
    "used_days" INTEGER NOT NULL DEFAULT 0,
    "pending_days" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "leave_policy_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "requested_working_days" INTEGER NOT NULL,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "leave_policies_code_key" ON "leave_policies"("code");
CREATE UNIQUE INDEX "leave_balances_employee_id_leave_policy_id_year_key" ON "leave_balances"("employee_id", "leave_policy_id", "year");
CREATE INDEX "leave_balances_employee_id_year_idx" ON "leave_balances"("employee_id", "year");
CREATE INDEX "leave_requests_employee_id_start_date_end_date_idx" ON "leave_requests"("employee_id", "start_date", "end_date");

ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_leave_policy_id_fkey" FOREIGN KEY ("leave_policy_id") REFERENCES "leave_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_policy_id_fkey" FOREIGN KEY ("leave_policy_id") REFERENCES "leave_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
