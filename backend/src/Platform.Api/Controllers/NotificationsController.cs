using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Platform.Infrastructure;

namespace Platform.Api.Controllers;

[Route("api/notifications")]
public class NotificationsController : ApiControllerBase
{
    public NotificationsController(AppDbContext db) : base(db) { }

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var list = await Db.Notifications.Where(n => n.UserId == Me)
            .OrderByDescending(n => n.CreatedAt).Take(30).ToListAsync();
        var unread = await Db.Notifications.CountAsync(n => n.UserId == Me && !n.IsRead);
        return Ok(new { unread, items = list.Select(n => new { n.Id, n.Title, n.Body, n.Link, n.IsRead, n.CreatedAt }) });
    }

    [HttpPost("{id:guid}/read")]
    public async Task<IActionResult> Read(Guid id)
    {
        var n = await Db.Notifications.FirstOrDefaultAsync(x => x.Id == id && x.UserId == Me);
        if (n is null) return NotFound();
        n.IsRead = true;
        await Db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("read-all")]
    public async Task<IActionResult> ReadAll()
    {
        var list = await Db.Notifications.Where(n => n.UserId == Me && !n.IsRead).ToListAsync();
        foreach (var n in list) n.IsRead = true;
        await Db.SaveChangesAsync();
        return NoContent();
    }
}
