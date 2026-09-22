import { notFound } from "next/navigation";
import RoomClient from "./RoomClient";

const ROOM_ID_REGEX = /^[A-Z0-9]{6}-[A-Z0-9]{4}$/;

function isValidRoomId(id: string): boolean {
  try {
    const decoded = decodeURIComponent(id);
    return ROOM_ID_REGEX.test(decoded) && decoded.length <= 11;
  } catch {
    return false;
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Strict validation: reject path traversal, control chars, long IDs
  if (!isValidRoomId(id)) {
    notFound();
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(id).toUpperCase();
  } catch {
    notFound();
  }
  // Extra sanity: no dots, slashes, spaces
  if (decoded.includes("/") || decoded.includes(".") || decoded.includes(" ")) {
    notFound();
  }
  return <RoomClient roomId={decoded} />;
}
