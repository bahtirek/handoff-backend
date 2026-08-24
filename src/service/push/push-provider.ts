export type PushResult = {
  sent: boolean;
  reason?: string;
};

export interface PushProvider {
  send(
    token: string,
    title: string,
    body: string,
    data: Record<string, string>
  ): Promise<PushResult>;
}