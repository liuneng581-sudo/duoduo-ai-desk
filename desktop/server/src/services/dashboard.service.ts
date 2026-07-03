import { dashboardRepository } from '../repositories/dashboard.repository';

export const dashboardService = {
  getOverview: (userId: string) => dashboardRepository.getOverview(userId),
  getStoreSummary: (storeId: string) => dashboardRepository.getStoreSummary(storeId),
};
