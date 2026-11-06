#!/usr/bin/env bash
# backend klasöründe çalıştırın: bash kur.sh
set -e
rm -f src/Platform.Api/WeatherForecast.cs src/Platform.Api/Controllers/WeatherForecastController.cs
dotnet add src/Platform.Infrastructure package Npgsql.EntityFrameworkCore.PostgreSQL --version 8.0.11
dotnet add src/Platform.Api package Npgsql.EntityFrameworkCore.PostgreSQL --version 8.0.11
dotnet add src/Platform.Api package Microsoft.AspNetCore.Authentication.JwtBearer --version 8.0.11
dotnet add src/Platform.Api package Microsoft.Extensions.Identity.Core --version 8.0.11
dotnet build
echo "KURULUM TAMAM"
