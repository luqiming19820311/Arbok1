import type { Subscription } from "@/components/arbok/types";
import {
  clearFolderFromSubscriptions,
  deleteSubscription,
  deleteSubscriptions,
  listSubscriptions,
  renameSubscription,
  updateSubscriptionFolder,
  updateSubscriptionPlaybackRate,
  upsertSubscription,
} from "@/lib/server/db";

export async function POST(request: Request) {
  const body = (await request.json()) as Subscription;
  if (!body.id || !body.name || !body.platform) {
    return Response.json({ error: "无效的订阅数据" }, { status: 400 });
  }
  upsertSubscription(body);
  return Response.json({ subscriptions: listSubscriptions() });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    ids?: string[];
    playbackRate?: number;
    folderId?: string | null;
    name?: string;
    clearFolderId?: string;
  };

  if (typeof body.clearFolderId === "string" && body.clearFolderId) {
    clearFolderFromSubscriptions(body.clearFolderId);
    return Response.json({ subscriptions: listSubscriptions() });
  }

  if (Array.isArray(body.ids) && body.ids.length > 0 && "folderId" in body) {
    updateSubscriptionFolder(body.ids, body.folderId ?? null);
    return Response.json({ subscriptions: listSubscriptions() });
  }

  if (body.id && "folderId" in body) {
    updateSubscriptionFolder([body.id], body.folderId ?? null);
    return Response.json({ subscriptions: listSubscriptions() });
  }

  if (body.id && typeof body.name === "string" && body.name.trim()) {
    renameSubscription(body.id, body.name);
    return Response.json({ subscriptions: listSubscriptions() });
  }

  if (body.id && typeof body.playbackRate === "number") {
    updateSubscriptionPlaybackRate(body.id, body.playbackRate);
    return Response.json({ subscriptions: listSubscriptions() });
  }

  return Response.json({ error: "缺少有效的订阅更新参数" }, { status: 400 });
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    ids?: string[];
  };
  if (Array.isArray(body.ids) && body.ids.length > 0) {
    deleteSubscriptions(body.ids);
    return Response.json({ subscriptions: listSubscriptions() });
  }
  if (!body.id) {
    return Response.json({ error: "缺少订阅 id" }, { status: 400 });
  }
  deleteSubscription(body.id);
  return Response.json({ subscriptions: listSubscriptions() });
}
