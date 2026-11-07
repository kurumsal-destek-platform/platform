# 1) Derleme
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish src/Platform.Api/Platform.Api.csproj -c Release -o /app

# 2) Çalıştırma (küçük imaj)
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app .
EXPOSE 8080
ENTRYPOINT ["dotnet", "Platform.Api.dll"]
