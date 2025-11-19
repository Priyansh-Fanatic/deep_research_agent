import typer
from rich.console import Console
from rich.markdown import Markdown
from src.graph import app

console = Console()
cli = typer.Typer()

@cli.command()
def research(topic: str):
    """
    Conducts deep research on a given topic.
    """
    console.print(f"[bold green]Starting research on:[/bold green] {topic}")
    
    initial_state = {
        "topic": topic,
        "plan": [],
        "past_steps": [],
        "search_queries": [],
        "search_results": [],
        "research_notes": [],
        "report": "",
        "is_finished": False,
        "iteration": 0
    }
    
    # Run the graph
    final_state = app.invoke(initial_state)
    
    # Output the report
    report = final_state["report"]
    
    console.print("\n[bold]Research Complete![/bold]\n")
    console.print(Markdown(report))
    
    # Save to file
    filename = f"{topic.replace(' ', '_').lower()}_report.md"
    with open(filename, "w", encoding="utf-8") as f:
        f.write(report)
    
    console.print(f"\n[blue]Report saved to {filename}[/blue]")

if __name__ == "__main__":
    cli()
