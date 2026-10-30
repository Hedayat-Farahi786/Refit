export type RequestStatus = 'open' | 'in-progress' | 'done';
export type RequestPriority = 'low' | 'normal' | 'high';

export interface ServiceRequest {
  id: number;
  title: string;
  requester: string;
  priority: RequestPriority;
  status: RequestStatus;
  description: string;
  createdAt: string;
}

export interface RequestStats {
  open: number;
  inProgress: number;
  done: number;
}

export type NewServiceRequest = Pick<ServiceRequest, 'title' | 'requester' | 'priority' | 'description'>;
