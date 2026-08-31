import { COOKIE_NAME } from "@shared/const";
import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { lmsAuthRouter } from "./lms/authRouter";
import { assessmentRouter } from "./lms/assessmentRouter";
import { attemptRouter } from "./lms/attemptRouter";
import { importRouter } from "./lms/importRouter";
import { peopleRouter } from "./lms/peopleRouter";
import { platformRouter } from "./lms/platformRouter";
import { tableRouter } from "./lms/tableRouter";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: lmsAuthRouter,
  platform: platformRouter,
  people: peopleRouter,
  tables: tableRouter,
  imports: importRouter,
  assessments: assessmentRouter,
  attempts: attemptRouter,
});

export type AppRouter = typeof appRouter;
