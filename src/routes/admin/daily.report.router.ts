import express from 'express';
import authenticateUser from '../../middlewares/authenticate.user';
import authenticateAdmin from '../../middlewares/authenticate.admin';
import {
  getShiftSettingsController,
  putShiftSettingsController,
  getLogsController,
  getReportByIdController,
  getSummaryController,
  getAvgWorkHoursChartController,
  getWorkHoursPerMonthChartController,
  postCheckInController,
  postCheckOutController,
  patchReportController,
} from '../../controllers/admin/daily.report.controller';

const router = express.Router();
const withAuth = [authenticateUser];
const adminOnly = [authenticateUser, authenticateAdmin];

router.get('/shift-settings', ...withAuth, getShiftSettingsController);
router.put('/shift-settings', ...adminOnly, putShiftSettingsController);
router.get('/logs', ...withAuth, getLogsController);
router.get('/reports/:reportId', ...withAuth, getReportByIdController);
router.get('/summary', ...withAuth, getSummaryController);
router.get('/charts/avg-work-hours', ...withAuth, getAvgWorkHoursChartController);
router.get('/charts/work-hours-per-month', ...withAuth, getWorkHoursPerMonthChartController);
router.post('/check-in', ...withAuth, postCheckInController);
router.post('/check-out', ...withAuth, postCheckOutController);
router.patch('/reports/:reportId', ...withAuth, patchReportController);

export default router;
