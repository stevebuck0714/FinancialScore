import { DATAROOM_DEFAULT_FOLDERS } from './constants';

function asObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

export function getDataRoomState(userDefinedAllocations: unknown) {
  const root = asObject(userDefinedAllocations);
  const dataRoom = asObject(root.dataRoom);
  const folders = Array.isArray(dataRoom.folders) ? dataRoom.folders : [];
  const documentIndex = Array.isArray(dataRoom.documentIndex) ? dataRoom.documentIndex : [];
  const subscription = asObject(dataRoom.subscription);
  return {
    root,
    dataRoom,
    folders,
    documentIndex,
    subscription,
  };
}

export function upsertDataRoomState(
  userDefinedAllocations: unknown,
  patch: Record<string, any>,
) {
  const root = asObject(userDefinedAllocations);
  const dataRoom = asObject(root.dataRoom);
  return {
    ...root,
    dataRoom: {
      ...dataRoom,
      folders:
        Array.isArray(dataRoom.folders) && dataRoom.folders.length > 0
          ? dataRoom.folders
          : DATAROOM_DEFAULT_FOLDERS,
      documentIndex: Array.isArray(dataRoom.documentIndex) ? dataRoom.documentIndex : [],
      ...patch,
    },
  };
}

