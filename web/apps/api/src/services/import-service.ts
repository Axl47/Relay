import { ImportRepository } from "../repositories/import-repository";

export class ImportService {
  constructor(private readonly imports: ImportRepository) {}

  listImportJobs(userId: string) {
    return this.imports.listJobs(userId).then((jobs) => ({ jobs: jobs.reverse() }));
  }

  createImportJob(userId: string) {
    return this.imports.createJob(userId);
  }

  getImportJob(userId: string, jobId: string) {
    return this.imports.getJob(userId, jobId);
  }
}
