using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Platform.Infrastructure.Migrations
{
    // Kullanıcı departmanı; ticket: birleştirme, takipçiler, "yanıt bekleniyor" (SLA durur); hazır yanıtlar
    [DbContext(typeof(AppDbContext))]
    [Migration("20261122120000_DepartmanVeDestekMasasi")]
    public partial class DepartmanVeDestekMasasi : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(name: "Department", table: "Users", type: "text", nullable: true);

            migrationBuilder.AddColumn<Guid>(name: "MergedIntoId", table: "Tickets", type: "uuid", nullable: true);
            migrationBuilder.AddColumn<DateTime>(name: "WaitingSince", table: "Tickets", type: "timestamp with time zone", nullable: true);
            migrationBuilder.AddColumn<Guid[]>(name: "Watchers", table: "Tickets", type: "uuid[]", nullable: false, defaultValueSql: "'{}'::uuid[]");

            migrationBuilder.CreateTable(
                name: "CannedResponses",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "text", nullable: false),
                    Body = table.Column<string>(type: "text", nullable: false),
                    Category = table.Column<string>(type: "text", nullable: true),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    Shared = table.Column<bool>(type: "boolean", nullable: false),
                    UsageCount = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table => table.PrimaryKey("PK_CannedResponses", x => x.Id));

        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "CannedResponses");
            migrationBuilder.DropColumn(name: "Department", table: "Users");
            migrationBuilder.DropColumn(name: "MergedIntoId", table: "Tickets");
            migrationBuilder.DropColumn(name: "WaitingSince", table: "Tickets");
            migrationBuilder.DropColumn(name: "Watchers", table: "Tickets");
        }
    }
}
