using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Platform.Infrastructure.Migrations
{
    // Bilgi bankası yönetimi: yazar/düzenleyen, sürüm geçmişi, etiketler, okunma sayısı, arşiv
    [DbContext(typeof(AppDbContext))]
    [Migration("20261122150000_BilgiBankasiYonetimi")]
    public partial class BilgiBankasiYonetimi : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(name: "CreatedBy", table: "Articles", type: "uuid", nullable: true);
            migrationBuilder.AddColumn<Guid>(name: "UpdatedBy", table: "Articles", type: "uuid", nullable: true);
            migrationBuilder.AddColumn<DateTime>(name: "UpdatedAt", table: "Articles", type: "timestamp with time zone", nullable: true);
            migrationBuilder.AddColumn<int>(name: "Version", table: "Articles", type: "integer", nullable: false, defaultValue: 1);
            migrationBuilder.AddColumn<string[]>(name: "Tags", table: "Articles", type: "text[]", nullable: false, defaultValueSql: "'{}'::text[]");
            migrationBuilder.AddColumn<int>(name: "ViewCount", table: "Articles", type: "integer", nullable: false, defaultValue: 0);
            migrationBuilder.AddColumn<bool>(name: "Archived", table: "Articles", type: "boolean", nullable: false, defaultValue: false);
            migrationBuilder.AddColumn<DateTime>(name: "ArchivedAt", table: "Articles", type: "timestamp with time zone", nullable: true);
            migrationBuilder.AddColumn<Guid>(name: "ArchivedBy", table: "Articles", type: "uuid", nullable: true);

            migrationBuilder.CreateTable(
                name: "ArticleRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    ArticleId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    Title = table.Column<string>(type: "text", nullable: false),
                    Body = table.Column<string>(type: "text", nullable: false),
                    Category = table.Column<string>(type: "text", nullable: false),
                    Tags = table.Column<string[]>(type: "text[]", nullable: false),
                    EditedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    EditedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table => table.PrimaryKey("PK_ArticleRevisions", x => x.Id));
            migrationBuilder.CreateIndex(name: "IX_ArticleRevisions_ArticleId_Version", table: "ArticleRevisions", columns: new[] { "ArticleId", "Version" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "ArticleRevisions");
            foreach (var c in new[] { "CreatedBy", "UpdatedBy", "UpdatedAt", "Version", "Tags", "ViewCount", "Archived", "ArchivedAt", "ArchivedBy" })
                migrationBuilder.DropColumn(name: c, table: "Articles");
        }
    }
}
