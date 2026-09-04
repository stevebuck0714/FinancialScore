import { DATAROOM_DEFAULT_FOLDERS } from './constants';

function asObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

function getFolders(value: unknown, initializeWhenEmpty = false) {
  const folders = Array.isArray(value) ? value : [];
  if (folders.length === 0) {
    return initializeWhenEmpty ? [...DATAROOM_DEFAULT_FOLDERS] : [];
  }
  const existingIds = new Set(folders.map((folder) => String(folder?.id)));
  return [
    ...folders,
    ...DATAROOM_DEFAULT_FOLDERS.filter((folder) => !existingIds.has(folder.id)),
  ];
}

export function getDataRoomState(userDefinedAllocations: unknown) {
  const root = asObject(userDefinedAllocations);
  const dataRoom = asObject(root.dataRoom);
  const folders = getFolders(dataRoom.folders);
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
      folders: getFolders(dataRoom.folders, true),
      documentIndex: Array.isArray(dataRoom.documentIndex) ? dataRoom.documentIndex : [],
      ...patch,
    },
  };
}

