import type {
  TenantDO,
  CustomerProfileView,
  OrderView,
  ShipmentView,
  MessageView,
  SessionMessageView,
} from "../tenant";

export async function getCustomerProfile(
  tenant: DurableObjectStub<TenantDO>,
  customerId: string,
): Promise<CustomerProfileView | null> {
  return tenant.getCustomerProfile(customerId);
}

export async function ordersByIds(
  tenant: DurableObjectStub<TenantDO>,
  ids: string[],
): Promise<OrderView[]> {
  return tenant.ordersByIds(ids);
}

export async function listOrders(
  tenant: DurableObjectStub<TenantDO>,
): Promise<OrderView[]> {
  return tenant.listOrders();
}

export async function listShipments(
  tenant: DurableObjectStub<TenantDO>,
): Promise<ShipmentView[]> {
  return tenant.listShipments();
}

export async function getShipment(
  tenant: DurableObjectStub<TenantDO>,
  shipmentId: string,
): Promise<ShipmentView | null> {
  return tenant.getShipment(shipmentId);
}

export async function listMessages(
  tenant: DurableObjectStub<TenantDO>,
  limit = 200,
): Promise<MessageView[]> {
  return tenant.listMessages(limit);
}

export async function thread(
  tenant: DurableObjectStub<TenantDO>,
  customerId: string,
  limit = 50,
): Promise<MessageView[]> {
  return tenant.thread(customerId, limit);
}

export async function getSessionHistory(
  tenant: DurableObjectStub<TenantDO>,
  customerId: string,
): Promise<SessionMessageView[]> {
  return tenant.getSessionHistory(customerId);
}

export async function upsertCustomer(
  tenant: DurableObjectStub<TenantDO>,
  phone: string,
): Promise<string> {
  return tenant.upsertCustomer(phone);
}

export async function recordMessage(
  tenant: DurableObjectStub<TenantDO>,
  message: Parameters<DurableObjectStub<TenantDO>["recordMessage"]>[0],
): Promise<boolean> {
  return tenant.recordMessage(message);
}

export async function recordEvent(
  tenant: DurableObjectStub<TenantDO>,
  event: Parameters<DurableObjectStub<TenantDO>["recordEvent"]>[0],
): Promise<number> {
  return tenant.recordEvent(event);
}

export async function submitProfile(
  tenant: DurableObjectStub<TenantDO>,
  customerId: string,
  patch: { name: string; email?: string | null; address?: any | null },
): Promise<CustomerProfileView> {
  return tenant.submitProfile(customerId, patch);
}

export async function select(
  tenant: DurableObjectStub<TenantDO>,
  query: string,
  ...params: unknown[]
): Promise<unknown[]> {
  return tenant.select(query, ...params);
}

export async function write(
  tenant: DurableObjectStub<TenantDO>,
  ops: unknown[],
): Promise<{ written: number }> {
  // @ts-expect-error: delegate to tenant
  return tenant.write(ops);
}

export async function getMemory(
  tenant: DurableObjectStub<TenantDO>,
  customerId: string,
): Promise<string | null> {
  return tenant.getMemory(customerId);
}

export async function setMemory(
  tenant: DurableObjectStub<TenantDO>,
  customerId: string,
  content: string,
): Promise<void> {
  return tenant.setMemory(customerId, content);
}
