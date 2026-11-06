using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Domain;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

public record CreateProjectRequest(string Key, string Name, string? Description);
public record AddMemberRequest(Guid UserId, string? Role);

[Route("api/projects")]
public class ProjectsController : ApiControllerBase
{
    public ProjectsController(AppDbContext db) : base(db) { }

    // Sadece üyesi olduğum projeler.
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var list = await (from p in Db.Projects
                          join m in Db.ProjectMembers on p.Id equals m.ProjectId
                          where m.UserId == Me
                          orderby p.Name
                          select new { p.Id, p.Key, p.Name, p.Description, myRole = m.Role })
                         .ToListAsync();
        return Ok(list);
    }

    [HttpGet("{key}")]
    public async Task<IActionResult> Get(string key)
    {
        var p = await Db.Projects.FirstOrDefaultAsync(x => x.Key == key.ToUpper());
        if (p is null) return NotFound();
        var me = await MembershipAsync(p.Id);
        if (me is null) return NotFound(); // üye değilse projenin varlığı bile gösterilmez

        var names = await UserNamesAsync();
        var members = await Db.ProjectMembers.Where(m => m.ProjectId == p.Id).ToListAsync();
        return Ok(new
        {
            p.Id, p.Key, p.Name, p.Description, myRole = me.Role,
            members = members.Select(m => new { m.UserId, fullName = names.GetValueOrDefault(m.UserId, "?"), m.Role }),
        });
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateProjectRequest req)
    {
        if (!IsManagerOrAdmin) return Forbidden("Proje oluşturmak için yönetici olmalısınız.");
        var key = req.Key.Trim().ToUpperInvariant();
        if (key.Length is < 2 or > 5) return BadRequest(new { message = "Anahtar 2-5 harf olmalı." });
        if (await Db.Projects.AnyAsync(x => x.Key == key)) return Conflict(new { message = "Bu anahtar kullanılıyor." });

        var p = new Project { Key = key, Name = req.Name, Description = req.Description ?? "" };
        Db.Projects.Add(p);
        Db.ProjectMembers.Add(new ProjectMember { ProjectId = p.Id, UserId = Me, Role = ProjectRoles.Manager });
        await Db.SaveChangesAsync();
        return CreatedAtAction(nameof(Get), new { key = p.Key }, new { p.Id, p.Key, p.Name });
    }

    [HttpPost("{key}/members")]
    public async Task<IActionResult> AddMember(string key, AddMemberRequest req)
    {
        var p = await Db.Projects.FirstOrDefaultAsync(x => x.Key == key.ToUpper());
        if (p is null) return NotFound();
        var me = await MembershipAsync(p.Id);
        if (me is null) return NotFound();
        if (me.Role != ProjectRoles.Manager) return Forbidden("Üye eklemek için proje yöneticisi olmalısınız.");
        if (!await Db.Users.AnyAsync(u => u.Id == req.UserId)) return BadRequest(new { message = "Kullanıcı bulunamadı." });
        if (await Db.ProjectMembers.AnyAsync(m => m.ProjectId == p.Id && m.UserId == req.UserId))
            return Conflict(new { message = "Kullanıcı zaten üye." });

        Db.ProjectMembers.Add(new ProjectMember
        {
            ProjectId = p.Id, UserId = req.UserId,
            Role = req.Role == ProjectRoles.Manager ? ProjectRoles.Manager : ProjectRoles.Member,
        });
        await Db.SaveChangesAsync();
        return NoContent();
    }
}
