#!/bin/bash

echo "🔍 AI Exam Taker - Docker Build Diagnostics"
echo "============================================="

# Check if we're in the right directory
if [ ! -f "Dockerfile.ai" ]; then
    echo "❌ Dockerfile.ai not found. Please run this script from the Remotely_AI_Exam directory."
    exit 1
fi

echo "📋 Step 1: Checking Docker build context..."
echo "Current directory: $(pwd)"
echo "Files in current directory:"
ls -la

echo ""
echo "📋 Step 2: Checking Dockerfile.ai content..."
if [ -f "Dockerfile.ai" ]; then
    echo "Dockerfile.ai exists. Content:"
    cat Dockerfile.ai
else
    echo "❌ Dockerfile.ai not found"
fi

echo ""
echo "📋 Step 3: Checking project files..."
if [ -f "Server/Server.csproj" ]; then
    echo "✅ Server.csproj found"
    echo "Checking for CommunityToolkit.Mvvm reference:"
    grep -n "CommunityToolkit.Mvvm" Server/Server.csproj || echo "❌ CommunityToolkit.Mvvm not found in Server.csproj"
else
    echo "❌ Server/Server.csproj not found"
fi

if [ -f "Shared/Shared.csproj" ]; then
    echo "✅ Shared.csproj found"
    echo "Checking for CommunityToolkit.Mvvm reference:"
    grep -n "CommunityToolkit.Mvvm" Shared/Shared.csproj || echo "❌ CommunityToolkit.Mvvm not found in Shared.csproj"
else
    echo "❌ Shared/Shared.csproj not found"
fi

echo ""
echo "📋 Step 4: Attempting to fix the build issue..."

# Create a fixed Dockerfile
cat > Dockerfile.ai.fixed << 'EOF'
# Use the official .NET SDK image for building
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy project files
COPY ["Server/Server.csproj", "Server/"]
COPY ["Shared/Shared.csproj", "Shared/"]

# Clear NuGet cache and restore with verbose logging
RUN dotnet nuget locals all --clear
RUN dotnet restore "Server/Server.csproj" --verbosity normal --no-cache

# Copy all source code
COPY . .

# Build the application
WORKDIR /src/Server
RUN dotnet build "Server.csproj" -c Release -o /app/build --no-restore

# Publish the application
RUN dotnet publish "Server.csproj" -c Release -o /app/publish --no-restore

# Use the official ASP.NET Core runtime image
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app

# Install curl for health checks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy the published application
COPY --from=build /app/publish .

# Expose port
EXPOSE 5000

# Set environment variables
ENV ASPNETCORE_URLS=http://+:5000
ENV ASPNETCORE_ENVIRONMENT=Production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Start the application
ENTRYPOINT ["dotnet", "Server.dll"]
EOF

echo "✅ Created Dockerfile.ai.fixed with improvements"

echo ""
echo "📋 Step 5: Recommended fixes..."
echo ""
echo "🔧 Fix Option 1: Use the fixed Dockerfile"
echo "   mv Dockerfile.ai.fixed Dockerfile.ai"
echo "   docker build -f Dockerfile.ai -t remotely-ai --no-cache ."
echo ""
echo "🔧 Fix Option 2: Clean build without cache"
echo "   docker system prune -f"
echo "   docker build -f Dockerfile.ai -t remotely-ai --no-cache --pull ."
echo ""
echo "🔧 Fix Option 3: Update package version"
echo "   # Edit Server.csproj and change CommunityToolkit.Mvvm version to 8.4.0 or latest"
echo ""
echo "🔧 Fix Option 4: Manual package restore"
echo "   docker run --rm -v \$(pwd):/src -w /src mcr.microsoft.com/dotnet/sdk:8.0 dotnet restore Server/Server.csproj --force"
echo ""

# Check if we can automatically apply the fix
read -p "🤖 Would you like me to automatically apply Fix Option 1 (use fixed Dockerfile)? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🔄 Applying fix..."
    mv Dockerfile.ai.fixed Dockerfile.ai
    echo "✅ Dockerfile.ai updated"
    
    echo "🔄 Building with fixed Dockerfile..."
    docker build -f Dockerfile.ai -t remotely-ai --no-cache .
    
    if [ $? -eq 0 ]; then
        echo "✅ Build successful!"
        echo "🚀 You can now run: docker run -p 5000:5000 remotely-ai"
    else
        echo "❌ Build still failed. Try the other fix options."
    fi
else
    echo "ℹ️  Fixed Dockerfile saved as Dockerfile.ai.fixed"
    echo "   You can manually apply it with: mv Dockerfile.ai.fixed Dockerfile.ai"
fi

echo ""
echo "📊 Diagnosis complete!"