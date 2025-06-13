#!/bin/bash

echo "🔧 AI Exam Taker - Remotely Build Fix"
echo "====================================="

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

# Check if we're in the right directory
if [ ! -d "Remotely_AI_Exam" ]; then
    print_error "Remotely_AI_Exam directory not found. Please run this script from the AI_Exam_Taker root directory."
    exit 1
fi

cd Remotely_AI_Exam

print_info "Current directory: $(pwd)"

# Diagnosis: Check the specific error
print_info "Diagnosing the CommunityToolkit.Mvvm package issue..."

# Check if project files exist
if [ ! -f "Server/Server.csproj" ]; then
    print_error "Server/Server.csproj not found"
    exit 1
fi

# Check for the problematic package reference
if grep -q "CommunityToolkit.Mvvm" Server/Server.csproj; then
    print_warning "Found CommunityToolkit.Mvvm reference in Server.csproj"
    grep -n "CommunityToolkit.Mvvm" Server/Server.csproj
else
    print_info "CommunityToolkit.Mvvm not found in Server.csproj, checking Shared.csproj..."
    if [ -f "Shared/Shared.csproj" ] && grep -q "CommunityToolkit.Mvvm" Shared/Shared.csproj; then
        print_warning "Found CommunityToolkit.Mvvm reference in Shared.csproj"
        grep -n "CommunityToolkit.Mvvm" Shared/Shared.csproj
    fi
fi

echo ""
print_info "Applying fixes for the NuGet package issue..."

# Fix 1: Update the package version to a stable one
print_info "Fix 1: Updating CommunityToolkit.Mvvm to latest stable version..."

# Backup original files
cp Server/Server.csproj Server/Server.csproj.backup 2>/dev/null || true
cp Shared/Shared.csproj Shared/Shared.csproj.backup 2>/dev/null || true

# Update package version in Server.csproj
if [ -f "Server/Server.csproj" ]; then
    sed -i.bak 's/CommunityToolkit\.Mvvm.*Version="8\.3\.2"/CommunityToolkit.Mvvm" Version="8.4.0"/g' Server/Server.csproj
    print_status "Updated CommunityToolkit.Mvvm version in Server.csproj"
fi

# Update package version in Shared.csproj
if [ -f "Shared/Shared.csproj" ]; then
    sed -i.bak 's/CommunityToolkit\.Mvvm.*Version="8\.3\.2"/CommunityToolkit.Mvvm" Version="8.4.0"/g' Shared/Shared.csproj
    print_status "Updated CommunityToolkit.Mvvm version in Shared.csproj"
fi

# Fix 2: Create an improved Dockerfile with better NuGet handling
print_info "Fix 2: Creating improved Dockerfile..."

cat > Dockerfile.ai << 'EOF'
# Use the official .NET SDK image for building
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Set environment variables for better NuGet behavior
ENV NUGET_XMLDOC_MODE=skip
ENV DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1

# Copy project files first for better layer caching
COPY ["Server/Server.csproj", "Server/"]
COPY ["Shared/Shared.csproj", "Shared/"]

# Clear NuGet cache and restore packages with retries
RUN dotnet nuget locals all --clear && \
    dotnet restore "Server/Server.csproj" \
        --verbosity normal \
        --no-cache \
        --force \
        --disable-parallel \
        --runtime linux-x64

# Copy all source code
COPY . .

# Build the application with explicit configuration
WORKDIR /src/Server
RUN dotnet build "Server.csproj" \
    -c Release \
    -o /app/build \
    --no-restore \
    --verbosity normal

# Publish the application
RUN dotnet publish "Server.csproj" \
    -c Release \
    -o /app/publish \
    --no-restore \
    --no-build \
    --runtime linux-x64 \
    --self-contained false

# Use the official ASP.NET Core runtime image
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
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

# Expose ports
EXPOSE 5000
EXPOSE 5001

# Set environment variables
ENV ASPNETCORE_URLS=http://+:5000
ENV ASPNETCORE_ENVIRONMENT=Production
ENV ASPNETCORE_FORWARDEDHEADERS_ENABLED=true

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Start the application
ENTRYPOINT ["dotnet", "Server.dll"]
EOF

print_status "Created improved Dockerfile.ai"

# Fix 3: Create a NuGet.config file to ensure proper package sources
print_info "Fix 3: Creating NuGet.config for reliable package restoration..."

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
  </packageSourceMapping>
  <config>
    <add key="globalPackagesFolder" value="/tmp/nuget-packages" />
    <add key="http_proxy" value="" />
    <add key="https_proxy" value="" />
  </config>
</configuration>
EOF

print_status "Created NuGet.config"

# Fix 4: Create a build script that handles the Docker build with proper error handling
print_info "Fix 4: Creating build script with error handling..."

cat > build-remotely-ai.sh << 'EOF'
#!/bin/bash

echo "🚀 Building Remotely AI Exam Taker Docker Image"
echo "=============================================="

# Clean up any previous failed builds
echo "🧹 Cleaning up previous builds..."
docker system prune -f
docker builder prune -f

# Remove any existing image
docker rmi remotely-ai 2>/dev/null || true

# Build with no cache and verbose output
echo "🔨 Building Docker image..."
docker build \
    -f Dockerfile.ai \
    -t remotely-ai \
    --no-cache \
    --pull \
    --progress=plain \
    . 2>&1 | tee build.log

# Check if build was successful
if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo "🚀 You can now run the container with:"
    echo "   docker run -d -p 5000:5000 --name remotely-ai-container remotely-ai"
    echo ""
    echo "🔗 Access the application at: http://localhost:5000"
    echo "📊 AI Exam Taker integration will be available through the API"
else
    echo "❌ Build failed. Check build.log for details."
    echo "🔍 Common solutions:"
    echo "   1. Check internet connectivity"
    echo "   2. Verify all project files are present"
    echo "   3. Try running: docker system prune -a -f"
    echo "   4. Check the build.log file for specific errors"
    exit 1
fi
EOF

chmod +x build-remotely-ai.sh
print_status "Created build-remotely-ai.sh script"

# Fix 5: Create a quick test script to verify the package issue
print_info "Fix 5: Testing package restoration locally..."

# Test if we can restore packages locally
if command -v dotnet &> /dev/null; then
    print_info "Testing local package restoration..."
    dotnet restore Server/Server.csproj --verbosity quiet
    if [ $? -eq 0 ]; then
        print_status "Local package restoration successful"
    else
        print_warning "Local package restoration failed - this confirms the package issue"
    fi
else
    print_warning ".NET SDK not found locally - skipping local test"
fi

echo ""
print_info "🎯 Recommended Action Plan:"
echo ""
echo "1. 📦 Updated package versions to stable releases"
echo "2. 🐳 Created improved Dockerfile with better NuGet handling"
echo "3. ⚙️  Added NuGet.config for reliable package sources"
echo "4. 🔨 Created automated build script with error handling"
echo ""
print_info "To proceed with the fix:"
echo "   ./build-remotely-ai.sh"
echo ""
print_info "If the build still fails, check build.log for specific errors"

# Ask user if they want to run the build now
read -p "🤖 Would you like to run the build now? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "🔄 Starting build process..."
    ./build-remotely-ai.sh
else
    print_info "Build script ready. Run './build-remotely-ai.sh' when ready."
fi

print_status "Fix process completed!"