using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Platform.Infrastructure.Migrations
{
    // Destek ekibinin uzmanlık alanları ("Kimler ilgilenir?" ve atama önerisi için)
    [DbContext(typeof(AppDbContext))]
    [Migration("20261122170000_UzmanlikAlanlari")]
    public partial class UzmanlikAlanlari : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder) =>
            migrationBuilder.AddColumn<string[]>(name: "Expertise", table: "Users", type: "text[]", nullable: false, defaultValueSql: "'{}'::text[]");

        protected override void Down(MigrationBuilder migrationBuilder) =>
            migrationBuilder.DropColumn(name: "Expertise", table: "Users");
    }
}
