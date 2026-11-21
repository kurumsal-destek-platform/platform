using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Platform.Infrastructure.Migrations
{
    // Otomasyon kuralları tablosu + haftalık yönetici özeti ayarları
    [DbContext(typeof(AppDbContext))]
    [Migration("20261119090000_OtomasyonVeOzet")]
    public partial class OtomasyonVeOzet : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AutomationRules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Enabled = table.Column<bool>(type: "boolean", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    WhenCategory = table.Column<string>(type: "text", nullable: true),
                    WhenPriority = table.Column<string>(type: "text", nullable: true),
                    WhenKeywords = table.Column<string>(type: "text", nullable: true),
                    WhenSenderDomain = table.Column<string>(type: "text", nullable: true),
                    SetAssigneeId = table.Column<Guid>(type: "uuid", nullable: true),
                    SetPriority = table.Column<string>(type: "text", nullable: true),
                    SetCategory = table.Column<string>(type: "text", nullable: true),
                    NotifyManagers = table.Column<bool>(type: "boolean", nullable: false),
                    StopProcessing = table.Column<bool>(type: "boolean", nullable: false),
                    RunCount = table.Column<int>(type: "integer", nullable: false),
                    LastRunAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AutomationRules", x => x.Id);
                });

            migrationBuilder.AddColumn<bool>(
                name: "WeeklyDigest",
                table: "TenantSettings",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastDigestAt",
                table: "TenantSettings",
                type: "timestamp with time zone",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "AutomationRules");
            migrationBuilder.DropColumn(name: "WeeklyDigest", table: "TenantSettings");
            migrationBuilder.DropColumn(name: "LastDigestAt", table: "TenantSettings");
        }
    }
}
