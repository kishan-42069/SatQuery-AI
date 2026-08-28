FROM python:3.11-slim

# System dependencies: GDAL, PostgreSQL client, build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    gdal-bin \
    libgdal-dev \
    libgeos-dev \
    libproj-dev \
    libpq-dev \
    gcc \
    g++ \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set GDAL env vars so rasterio/geopandas find the system GDAL
ENV GDAL_VERSION=3.6.2
ENV CPLUS_INCLUDE_PATH=/usr/include/gdal
ENV C_INCLUDE_PATH=/usr/include/gdal

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir GDAL==$(gdal-config --version) \
    && pip install --no-cache-dir -r requirements.txt

COPY . .

# ⚠️  IMPORTANT: data/raw is the dataset drop zone for manual user uploads.
# Mount this directory as a Docker volume so data persists across restarts.
VOLUME ["/app/data"]

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
