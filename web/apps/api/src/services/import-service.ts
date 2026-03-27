import { ImportRepository } from "../repositories/import-repository";

export class ImportService {
  constructor(private readonly imports: ImportRepository) {}

  createImportJob(userId: string) {
    return this.imports.createJob(userId);
  }

  getImportJob(userId: string, jobId: string) {
    return this.imports.getJob(userId, jobId);
  }
}
