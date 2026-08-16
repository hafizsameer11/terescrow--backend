import { Job } from 'bull';
import { processBushaKycApplication } from '../../services/busha/busha.kyc.service';

export type BushaKycJobData = {
  applicationId: string;
};

export async function processBushaKycJob(job: Job<BushaKycJobData>) {
  const applicationId = job.data?.applicationId;
  if (!applicationId) {
    throw new Error('applicationId is required');
  }
  await processBushaKycApplication(applicationId);
}
