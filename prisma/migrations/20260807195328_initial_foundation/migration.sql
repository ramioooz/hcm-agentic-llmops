-- CreateEnum
CREATE TYPE "AccessRole" AS ENUM ('EMPLOYEE', 'MANAGER', 'HR');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "OnboardingReviewStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "SecurityEventType" AS ENUM ('AUTHORIZATION_DENIED', 'UNSAFE_REQUEST_REJECTED', 'PII_REDACTION_APPLIED');

-- CreateEnum
CREATE TYPE "SecuritySeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "employee_code" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "job_title" TEXT NOT NULL,
    "access_role" "AccessRole" NOT NULL DEFAULT 'EMPLOYEE',
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "manager_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_review_periods" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "OnboardingReviewStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_review_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "thread_id" TEXT,
    "trigger_type" TEXT NOT NULL,
    "intent" TEXT,
    "status" "RunStatus" NOT NULL DEFAULT 'STARTED',
    "actor_employee_code" TEXT,
    "request_summary" TEXT,
    "result_summary" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_run_steps" (
    "id" TEXT NOT NULL,
    "agent_run_id" TEXT NOT NULL,
    "step_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "outcome_code" TEXT,
    "input_data" TEXT,
    "output_data" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "agent_run_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_events" (
    "id" TEXT NOT NULL,
    "agent_run_id" TEXT,
    "correlation_id" TEXT,
    "actor_employee_code" TEXT,
    "event_type" "SecurityEventType" NOT NULL,
    "severity" "SecuritySeverity" NOT NULL,
    "details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_code_key" ON "employees"("employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_email_key" ON "employees"("email");

-- CreateIndex
CREATE INDEX "employees_manager_id_idx" ON "employees"("manager_id");

-- CreateIndex
CREATE INDEX "onboarding_review_periods_employee_id_status_end_date_idx" ON "onboarding_review_periods"("employee_id", "status", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "agent_runs_run_id_key" ON "agent_runs"("run_id");

-- CreateIndex
CREATE INDEX "agent_runs_correlation_id_idx" ON "agent_runs"("correlation_id");

-- CreateIndex
CREATE INDEX "agent_runs_actor_employee_code_idx" ON "agent_runs"("actor_employee_code");

-- CreateIndex
CREATE INDEX "agent_run_steps_agent_run_id_started_at_idx" ON "agent_run_steps"("agent_run_id", "started_at");

-- CreateIndex
CREATE INDEX "security_events_correlation_id_created_at_idx" ON "security_events"("correlation_id", "created_at");

-- CreateIndex
CREATE INDEX "security_events_event_type_created_at_idx" ON "security_events"("event_type", "created_at");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_review_periods" ADD CONSTRAINT "onboarding_review_periods_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_actor_employee_code_fkey" FOREIGN KEY ("actor_employee_code") REFERENCES "employees"("employee_code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_run_steps" ADD CONSTRAINT "agent_run_steps_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_actor_employee_code_fkey" FOREIGN KEY ("actor_employee_code") REFERENCES "employees"("employee_code") ON DELETE SET NULL ON UPDATE CASCADE;
