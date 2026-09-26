"use client";

/**
 * Asset loading and upload, shared by Analyze and Compare.
 *
 * Upload is optimistic-free on purpose: `POST /assets/upload` runs rasterio
 * metadata extraction server-side, so the record that comes back carries
 * CRS/bbox/band count the client can't know in advance. Showing a
 * placeholder row and reconciling would misreport those fields for as long
 * as the request takes.
 */

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/lib/api/client";
import { assets as assetsApi } from "@/lib/api/endpoints";
import type { AssetMetadata } from "@/lib/api/types";

interface UseAssetsResult {
  assets: AssetMetadata[];
  total: number;
  isLoading: boolean;
  error: string | null;
  isUploading: boolean;
  uploadError: string | null;
  upload: (file: File) => Promise<AssetMetadata | null>;
  remove: (assetId: string) => Promise<void>;
  refresh: () => void;
}

export function useAssets(limit = 50): UseAssetsResult {
  const [assets, setAssets] = useState<AssetMetadata[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      setIsLoading(true);
      try {
        const page = await assetsApi.list({ limit }, controller.signal);
        setAssets(page.assets);
        setTotal(page.total);
        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof ApiError
            ? (err.detail ?? err.message)
            : "Could not load the asset catalogue.",
        );
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [limit, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const upload = useCallback(async (file: File) => {
    setIsUploading(true);
    setUploadError(null);
    try {
      const uploaded = await assetsApi.upload(file);
      // The upload response is a superset of the list shape; normalise it
      // so the catalogue holds one consistent record type.
      const record: AssetMetadata = {
        asset_id: uploaded.asset_id,
        filename: uploaded.filename,
        modality: uploaded.modality,
        crs: uploaded.crs,
        bbox: uploaded.bbox,
        acquisition_time: uploaded.acquisition_time,
        width: uploaded.width,
        height: uploaded.height,
        band_count: uploaded.band_count,
        storage_path: uploaded.storage_path,
        created_at: new Date().toISOString(),
      };
      setAssets((prev) => [record, ...prev]);
      setTotal((t) => t + 1);
      return record;
    } catch (err) {
      setUploadError(
        err instanceof ApiError
          ? (err.detail ?? err.message)
          : "Upload failed.",
      );
      return null;
    } finally {
      setIsUploading(false);
    }
  }, []);

  const remove = useCallback(async (assetId: string) => {
    const snapshot = assets;
    setAssets((prev) => prev.filter((a) => a.asset_id !== assetId));
    setTotal((t) => Math.max(0, t - 1));
    try {
      await assetsApi.remove(assetId);
    } catch {
      setAssets(snapshot); // Roll back; the record is still on the server.
    }
  }, [assets]);

  return {
    assets,
    total,
    isLoading,
    error,
    isUploading,
    uploadError,
    upload,
    remove,
    refresh,
  };
}
