import type { DriveSpreadsheetFile, SheetTabInfo } from '../types/dshyt';

async function handleApiResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Google API Error (${res.status})`;
    try {
      const errBody = await res.json();
      if (errBody?.error?.message) {
        message = errBody.error.message;
      }
    } catch {
      // ignore json parse error
    }
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export async function listDriveSpreadsheets(
  accessToken: string,
  searchQuery: string = ''
): Promise<DriveSpreadsheetFile[]> {
  const escapedSearch = searchQuery.trim().replace(/'/g, "\\'");
  const qParts = [
    "mimeType='application/vnd.google-apps.spreadsheet'",
    'trashed=false',
  ];
  if (escapedSearch) {
    qParts.push(`name contains '${escapedSearch}'`);
  }
  const params = new URLSearchParams({
    q: qParts.join(' and '),
    fields: 'files(id,name,modifiedTime,webViewLink)',
    orderBy: 'modifiedTime desc',
    pageSize: '25',
  });

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  const data = await handleApiResponse<{ files?: DriveSpreadsheetFile[] }>(res);
  return data.files || [];
}

export async function getSpreadsheetMetadata(
  accessToken: string,
  spreadsheetId: string
): Promise<{ title: string; tabs: SheetTabInfo[] }> {
  const params = new URLSearchParams({
    fields: 'properties.title,sheets.properties(sheetId,title)',
  });
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  const data = await handleApiResponse<{
    properties?: { title?: string };
    sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
  }>(res);

  return {
    title: data.properties?.title || 'Spreadsheet Kopi D’SHYT',
    tabs: (data.sheets || [])
      .map((s) => ({
        sheetId: s.properties?.sheetId ?? 0,
        title: s.properties?.title || 'Sheet1',
      })),
  };
}

export async function readSheetValues(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string
): Promise<string[][]> {
  const safeSheet = `'${sheetTitle.replace(/'/g, "''")}'!A1:O2000`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(safeSheet)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  const data = await handleApiResponse<{ values?: string[][] }>(res);
  return data.values || [];
}

export async function updateSheetCellValue(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string,
  cellA1: string,
  value: string
): Promise<void> {
  const range = `'${sheetTitle.replace(/'/g, "''")}'!${cellA1}`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range,
        majorDimension: 'ROWS',
        values: [[value]],
      }),
    }
  );
  await handleApiResponse(res);
}

export async function batchUpdateSheetValues(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string,
  updates: Array<{ rangeA1: string; values: string[][] }>
): Promise<void> {
  const escapedSheet = `'${sheetTitle.replace(/'/g, "''")}'`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: updates.map((u) => ({
          range: `${escapedSheet}!${u.rangeA1}`,
          majorDimension: 'ROWS',
          values: u.values,
        })),
      }),
    }
  );
  await handleApiResponse(res);
}

export async function appendSheetRow(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string,
  rowValues: string[]
): Promise<void> {
  const range = `'${sheetTitle.replace(/'/g, "''")}'!A:O`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        majorDimension: 'ROWS',
        values: [rowValues],
      }),
    }
  );
  await handleApiResponse(res);
}

export async function deleteSheetRow(
  accessToken: string,
  spreadsheetId: string,
  sheetId: number,
  rowIndexOneBased: number
): Promise<void> {
  const zeroBasedIndex = Math.max(1, rowIndexOneBased) - 1;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: zeroBasedIndex,
                endIndex: zeroBasedIndex + 1,
              },
            },
          },
        ],
      }),
    }
  );
  await handleApiResponse(res);
}
