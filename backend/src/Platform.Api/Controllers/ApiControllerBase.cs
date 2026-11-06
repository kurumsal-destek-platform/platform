using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

[ApiController]
[Authorize]
public abstract class ApiControllerBase : ControllerBase
{
    protected readonly AppDbContext Db;
    protected ApiControllerBase(AppDbContext db) { Db = db; }

    protected Guid Me => Guid.Parse(User.FindFirst("sub")!.Value);
    protected string MyRole => User.FindFirst("role")?.Value ?? Roles.Employee;
    protected bool IsManagerOrAdmin => MyRole is Roles.Manager or Roles.Admin;

    // Kullanıcının bu projedeki üyeliği (yoksa null). Tenant filtresi zaten uygulanır.
    protected Task<ProjectMember?> MembershipAsync(Guid projectId) =>
        Db.ProjectMembers.FirstOrDefaultAsync(m => m.ProjectId == projectId && m.UserId == Me);

    protected async Task<Dictionary<Guid, string>> UserNamesAsync() =>
        await Db.Users.ToDictionaryAsync(u => u.Id, u => u.FullName);

    protected ObjectResult Forbidden(string message) =>
        StatusCode(StatusCodes.Status403Forbidden, new { message });
}
