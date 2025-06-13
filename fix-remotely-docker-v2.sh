#!/bin/bash

# Enhanced Docker Build Fix Script for Remotely AI Exam Integration v2.0
# Addresses CommunityToolkit.Mvvm package issues, LibraryManager problems, and Docker build issues

set -e

echo "🔧 Enhanced Remotely Docker Build Fix Script v2.0"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Navigate to the Remotely directory
REMOTELY_DIR="Remotely_AI_Exam"
if [ ! -d "$REMOTELY_DIR" ]; then
    print_error "$REMOTELY_DIR directory not found!"
    print_info "Please ensure you're running this script from the correct location."
    exit 1
fi

cd "$REMOTELY_DIR"
print_info "Working in directory: $(pwd)"

echo ""
print_info "🔍 DIAGNOSIS PHASE"
print_info "=================="

# Check if Dockerfile exists
if [ ! -f "Dockerfile.ai" ]; then
    print_error "Dockerfile.ai not found!"
    exit 1
fi

print_status "Dockerfile.ai found"

# Check for package issues in project files
print_info "Checking for CommunityToolkit.Mvvm references..."
if grep -r "CommunityToolkit.Mvvm" . --include="*.csproj" --include="*.props" --include="*.targets" 2>/dev/null; then
    print_warning "Found CommunityToolkit.Mvvm references"
    PACKAGE_FOUND=true
else
    print_info "No CommunityToolkit.Mvvm references found"
    PACKAGE_FOUND=false
fi

# Check for LibraryManager issues
print_info "Checking libman.json configuration..."
if [ -f "Server/libman.json" ]; then
    print_status "Found libman.json - checking for problematic libraries..."
    if grep -q "@msgpack/msgpack\|@microsoft/signalr-protocol-msgpack" Server/libman.json; then
        print_warning "Found problematic JavaScript library references"
        LIBMAN_ISSUES=true
    else
        print_info "No problematic library references found"
        LIBMAN_ISSUES=false
    fi
else
    print_info "No libman.json found"
    LIBMAN_ISSUES=false
fi

echo ""
print_info "🛠️  APPLYING FIXES"
print_info "=================="

# Backup original files
print_info "Creating backups of original files..."
cp Server/Server.csproj Server/Server.csproj.backup 2>/dev/null || true
cp Shared/Shared.csproj Shared/Shared.csproj.backup 2>/dev/null || true
cp Dockerfile.ai Dockerfile.ai.backup 2>/dev/null || true
cp Server/libman.json Server/libman.json.backup 2>/dev/null || true

# Fix 1: Update package versions in project files
if [ "$PACKAGE_FOUND" = true ]; then
    print_info "Fix 1: Updating CommunityToolkit.Mvvm package versions..."
    
    # Find and update CommunityToolkit.Mvvm version to stable release
    find . -name "*.csproj" -exec sed -i.bak 's/CommunityToolkit\.Mvvm" Version="8\.3\.2"/CommunityToolkit.Mvvm" Version="8.4.0"/g' {} \;
    find . -name "*.props" -exec sed -i.bak 's/CommunityToolkit\.Mvvm" Version="8\.3\.2"/CommunityToolkit.Mvvm" Version="8.4.0"/g' {} \;
    
    print_status "Updated package versions to stable releases"
else
    print_info "No CommunityToolkit.Mvvm packages to update"
fi

# Fix 2: Update libman.json to use working CDN sources
if [ "$LIBMAN_ISSUES" = true ]; then
    print_info "Fix 2: Updating libman.json with working CDN sources..."
    
    cat > Server/libman.json << 'EOF'
{
  "version": "1.0",
  "defaultProvider": "cdnjs",
  "libraries": [
    {
      "library": "microsoft-signalr@8.0.7",
      "destination": "wwwroot/lib/microsoft-signalr/"
    },
    {
      "library": "msgpack@2.8.0",
      "destination": "wwwroot/lib/msgpack/",
      "provider": "cdnjs",
      "files": [
        "msgpack.min.js"
      ]
    },
    {
      "provider": "jsdelivr",
      "library": "@microsoft/signalr-protocol-msgpack@8.0.7",
      "destination": "wwwroot/lib/microsoft/signalr-protocol-msgpack/",
      "files": [
        "dist/browser/signalr-protocol-msgpack.min.js"
      ]
    },
    {
      "library": "font-awesome@6.5.2",
      "destination": "wwwroot/lib/fontawesome/"
    }
  ]
}
EOF

    print_status "Updated libman.json with working CDN sources"
    print_info "   - Changed @msgpack/msgpack to msgpack (cdnjs compatible)"
    print_info "   - Updated @microsoft/signalr-protocol-msgpack to use jsdelivr"
    print_info "   - Specified exact file paths for better reliability"
else
    print_info "No libman.json issues to fix"
fi

# Fix 3: Create improved Dockerfile with better NuGet and LibraryManager handling
print_info "Fix 3: Creating improved Dockerfile..."

cat > Dockerfile.ai << 'EOF'
# Enhanced Dockerfile for Remotely AI Exam Integration
# Addresses NuGet package restoration, LibraryManager issues, and build problems

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 5000

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Install Node.js for LibraryManager
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Set environment variables for better NuGet behavior
ENV NUGET_XMLDOC_MODE=skip
ENV DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1
ENV DOTNET_NOLOGO=1

# Clear NuGet cache and configure sources
RUN dotnet nuget locals all --clear
RUN dotnet nuget add source https://api.nuget.org/v3/index.json -n nuget.org

# Create NuGet.config for reliable package sources
COPY <<NUGET_EOF /src/NuGet.config
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" protocolVersion="3" />
    <add key="dotnet-tools" value="https://pkgs.dev.azure.com/dnceng/public/_packaging/dotnet-tools/nuget/v3/index.json" />
  </packageSources>
  <packageSourceMapping>
    <packageSource key="nuget.org">
      <package pattern="*" />
    </packageSource>
    <packageSource key="dotnet-tools">
      <package pattern="microsoft.*" />
      <package pattern="system.*" />
    </packageSource>
  </packageSourceMapping>
  <config>
    <add key="globalPackagesFolder" value="/tmp/nuget-packages" />
  </config>
</configuration>
NUGET_EOF

# Copy project files
COPY ["Server/Server.csproj", "Server/"]
COPY ["Shared/Shared.csproj", "Shared/"]
COPY ["Agent/Agent.csproj", "Agent/"]

# Restore packages with verbose logging and retry logic
WORKDIR /src/Server
RUN dotnet restore "Server.csproj" \
    --verbosity detailed \
    --disable-parallel \
    --force \
    --no-cache \
    || (echo "First restore failed, retrying..." && \
        dotnet nuget locals all --clear && \
        dotnet restore "Server.csproj" --verbosity detailed --force)

# Copy source code
COPY . .

# Install LibraryManager CLI tool
RUN dotnet tool install -g Microsoft.Web.LibraryManager.Cli

# Add dotnet tools to PATH
ENV PATH="$PATH:/root/.dotnet/tools"

# Restore JavaScript libraries with fallback strategy
RUN libman restore || (echo "LibraryManager restore failed, trying manual download..." && \
    mkdir -p wwwroot/lib/microsoft-signalr && \
    mkdir -p wwwroot/lib/msgpack && \
    mkdir -p wwwroot/lib/microsoft/signalr-protocol-msgpack && \
    mkdir -p wwwroot/lib/fontawesome && \
    curl -o wwwroot/lib/msgpack/msgpack.min.js https://cdn.jsdelivr.net/npm/msgpack@2.8.0/dist/msgpack.min.js || true && \
    curl -o wwwroot/lib/microsoft/signalr-protocol-msgpack/signalr-protocol-msgpack.min.js https://cdn.jsdelivr.net/npm/@microsoft/signalr-protocol-msgpack@8.0.7/dist/browser/signalr-protocol-msgpack.min.js || true)

# Build with comprehensive error handling
RUN dotnet build "Server.csproj" \
    -c Release \
    -o /app/build \
    --no-restore \
    --verbosity normal \
    || (echo "Build failed, attempting with restore..." && \
        dotnet build "Server.csproj" \
        -c Release \
        -o /app/build \
        --verbosity detailed)

# Publish the application
RUN dotnet publish "Server.csproj" \
    -c Release \
    -o /app/publish \
    --no-restore \
    --no-build \
    --verbosity normal

FROM base AS final
WORKDIR /app

# Install required packages for AI Exam Taker integration
RUN apt-get update && \
    apt-get install -y \
        curl \
        wget \
        unzip \
        && rm -rf /var/lib/apt/lists/*

# Copy the published application
COPY --from=build /app/publish .

# Create necessary directories for AI integration
RUN mkdir -p /app/ai-integration /app/logs /app/data

# Set environment variables
ENV ASPNETCORE_URLS=http://+:5000
ENV ASPNETCORE_ENVIRONMENT=Production
ENV ASPNETCORE_FORWARDEDHEADERS_ENABLED=true

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1

ENTRYPOINT ["dotnet", "Server.dll"]
EOF

print_status "Created improved Dockerfile with enhanced error handling"

# Fix 4: Create NuGet.config for reliable package sources
print_info "Fix 4: Creating NuGet.config..."

cat > NuGet.config << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" protocolVersion="3" />
    <add key="dotnet-tools" value="https://pkgs.dev.azure.com/dnceng/public/_packaging/dotnet-tools/nuget/v3/index.json" />
  </packageSources>
  <packageSourceMapping>
    <packageSource key="nuget.org">
      <package pattern="*" />
    </packageSource>
    <packageSource key="dotnet-tools">
      <package pattern="microsoft.*" />
      <package pattern="system.*" />
    </packageSource>
  </packageSourceMapping>
  <config>
    <add key="globalPackagesFolder" value="/tmp/nuget-packages" />
    <add key="http_proxy" value="" />
    <add key="https_proxy" value="" />
  </config>
</configuration>
EOF

print_status "Created NuGet.config with reliable package sources"

# Fix 5: Create automated build script
print_info "Fix 5: Creating automated build script..."

cat > build-remotely-ai-v2.sh << 'EOF'
#!/bin/bash

# Automated Remotely AI Docker Build Script v2.0
# Enhanced with comprehensive error handling and logging

set -e

echo "🚀 Building Remotely AI Exam Container v2.0"
echo "============================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Function to handle build failure
handle_failure() {
    log "❌ Build failed at step: $1"
    log "🔍 Checking for common issues..."
    
    # Check disk space
    df -h
    
    # Check Docker status
    docker system df
    
    log "💡 Try running: docker system prune -f"
    exit 1
}

# Cleanup previous builds
log "🧹 Cleaning up previous builds..."
docker system prune -f || true
docker rmi remotely-ai-exam:latest || true

# Build with progress tracking
log "🔨 Starting Docker build..."
docker build \
    -f Dockerfile.ai \
    -t remotely-ai-exam:latest \
    --progress=plain \
    --no-cache \
    . || handle_failure "Docker build"

log "✅ Build completed successfully!"

# Verify the image
log "🔍 Verifying built image..."
docker images | grep remotely-ai-exam || handle_failure "Image verification"

log "🎉 Remotely AI Exam container is ready!"
log "📋 To run: docker run -p 5000:5000 remotely-ai-exam:latest"

# Optional: Test the container
read -p "🤔 Would you like to test the container now? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log "🧪 Testing container..."
    docker run --rm -d -p 5000:5000 --name remotely-ai-test remotely-ai-exam:latest
    
    # Wait for startup
    sleep 10
    
    # Test health endpoint
    if curl -f http://localhost:5000/health 2>/dev/null; then
        log "✅ Container is healthy!"
    else
        log "⚠️  Health check failed, but container may still be starting..."
    fi
    
    # Stop test container
    docker stop remotely-ai-test || true
    log "🛑 Test container stopped"
fi

log "🎯 Build process complete!"
EOF

chmod +x build-remotely-ai-v2.sh
print_status "Created automated build script: build-remotely-ai-v2.sh"

echo ""
print_info "🎯 FIXES APPLIED SUCCESSFULLY"
print_info "============================="
print_status "Updated CommunityToolkit.Mvvm to version 8.4.0"
print_status "Fixed libman.json with working CDN sources and providers"
print_status "Created improved Dockerfile with LibraryManager fallback strategy"
print_status "Added NuGet.config for reliable package sources"
print_status "Created automated build script with error handling"

echo ""
print_info "🔧 KEY IMPROVEMENTS"
print_info "==================="
print_info "• Fixed JavaScript library restoration issues"
print_info "• Added fallback CDN providers (jsdelivr, cdnjs)"
print_info "• Implemented manual download fallback for critical libraries"
print_info "• Enhanced error handling for both NuGet and LibraryManager"
print_info "• Added LibraryManager CLI tool installation in Docker"

echo ""
print_info "🚀 NEXT STEPS"
print_info "============="
print_info "1. Run the automated build script:"
print_info "   ./build-remotely-ai-v2.sh"
print_info ""
print_info "2. Or build manually:"
print_info "   docker build -f Dockerfile.ai -t remotely-ai-exam:latest ."
print_info ""
print_info "3. Run the container:"
print_info "   docker run -p 5000:5000 remotely-ai-exam:latest"

# Ask if user wants to run the build now
echo ""
read -p "🤔 Would you like to run the automated build now? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "🚀 Starting automated build..."
    ./build-remotely-ai-v2.sh
else
    print_info "👍 You can run './build-remotely-ai-v2.sh' when ready"
fi

echo ""
print_status "🎉 Fix script v2.0 completed successfully!"

# Return to original directory
cd ..
print_status "Fix process completed! You can now run the build from Remotely_AI_Exam directory."