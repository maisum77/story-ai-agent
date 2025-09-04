import os
from typing import List, Dict, Any
from crewai import Agent, Task, Crew, LLM, Flow
from crewai.flow.flow import listen, start
from pydantic import BaseModel
import api



os.environ['GOOGLE_API_KEY'] = api.API()

gemini_llm = LLM(
    model="gemini/gemini-1.5-flash",
    api_key=os.environ['GOOGLE_API_KEY']
)

# ============= PYDANTIC MODELS FOR STATE MANAGEMENT =============

class ChapterState(BaseModel):
    chapter_number: int
    content: str
    word_count: int
    status: str = "pending"

class NovelState(BaseModel):
    title: str = "Untitled Novel"
    chapters: List[ChapterState] = []
    current_chapter: int = 1
    total_chapters: int = 15
    total_word_count: int = 0
    novel_context: str = ""

# ============= AGENTS FOR NOVEL WRITING =============

def create_novel_writer_agent():
    return Agent(
        role='Professional Novelist',
        goal='Write complete novel chapters with full narrative prose, detailed scenes, natural dialogue, and deep character development - exactly as readers would read in a published book.',
        backstory='''You are a bestselling novelist who writes complete, publication-ready chapters. You never write summaries or outlines - 
        you write the actual story. Every chapter you produce is 4,000-6,000 words of immersive narrative that readers can lose themselves in. 
        You show everything through scenes, dialogue, and action. When you write "Chapter 1," it's the actual Chapter 1 that readers will read, 
        not notes about Chapter 1. You write like Stephen King, George R.R. Martin, and Brandon Sanderson - full scenes, rich detail, living characters.''',
        llm=gemini_llm,
        verbose=True,
        max_iter=20,
        allow_delegation=False
    )

def create_dialogue_specialist_agent():
    return Agent(
        role='Dialogue and Speech Writer',
        goal='Create powerful, natural dialogue and memorable speeches that reveal character, advance plot, and resonate with readers emotionally.',
        backstory='''You write dialogue that feels so real readers forget they're reading. You know that people interrupt each other, trail off, 
        speak in fragments, and say one thing while meaning another. You craft speeches that move hearts and change minds. Every character 
        has their own voice - their own rhythm, vocabulary, and way of seeing the world. You write conversations that crackle with tension, 
        monologues that bare souls, and last words that haunt readers forever.''',
        llm=gemini_llm,
        verbose=True,
        max_iter=15,
        allow_delegation=False
    )

def create_character_development_agent():
    return Agent(
        role='Character Development Specialist',
        goal='Create deep, complex characters with rich backstories, clear motivations, and authentic emotional journeys that readers will connect with and remember.',
        backstory='''You breathe life into characters. You know that readers don't care about perfect heroes - they care about flawed humans 
        struggling to be better. You create backstories that explain but don't excuse, motivations that conflict, and growth that feels earned. 
        Every character you write has dreams, fears, secrets, and contradictions. You reveal character through action, reaction, and interaction, 
        making readers feel like they know these people personally.''',
        llm=gemini_llm,
        verbose=True,
        max_iter=15,
        allow_delegation=False
    )

def create_scene_writer_agent():
    return Agent(
        role='Immersive Scene Writer',
        goal='Write fully realized scenes with sensory details, emotional depth, and narrative momentum that transport readers into the story.',
        backstory='''You paint with words. Every scene you write engages all five senses. Readers don't just read about a dark alley - 
        they smell the garbage, hear the drip of water, feel the cold creeping through their clothes. You know that setting reflects emotion, 
        weather creates mood, and the right detail at the right moment can break a reader's heart. You write scenes so vivid that readers 
        forget where they are and live inside your words.''',
        llm=gemini_llm,
        verbose=True,
        max_iter=15,
        allow_delegation=False
    )

# ============= NOVEL WRITING FLOW =============

class NovelWritingFlow(Flow[NovelState]):
    
    def __init__(self):
        super().__init__()
        self.novel_writer = create_novel_writer_agent()
        self.dialogue_specialist = create_dialogue_specialist_agent()
        self.character_development = create_character_development_agent()
        self.scene_writer = create_scene_writer_agent()
    
    def _get_current_timestamp(self):
        """Get current timestamp for file updates."""
        from datetime import datetime
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    def _save_individual_chapter(self, chapter_num: int, content: str, word_count: int, is_error: bool = False):
        """Save an individual chapter to its own file."""
        try:
            # Create chapters directory if it doesn't exist
            import os
            if not os.path.exists("chapters"):
                os.makedirs("chapters")
            
            filename = f"chapters/Chapter_{chapter_num:02d}.txt"
            
            with open(filename, "w", encoding='utf-8') as f:
                f.write("="*70 + "\n")
                f.write(f"CHAPTER {chapter_num}\n")
                f.write("="*70 + "\n")
                if not is_error:
                    f.write(f"Word Count: {word_count:,} words\n")
                    f.write(f"Status: Completed\n")
                else:
                    f.write(f"Status: Error\n")
                f.write("="*70 + "\n\n")
                f.write(content)
                
                if not is_error:
                    f.write(f"\n\n--- End of Chapter {chapter_num} ---")
                    f.write(f"\nWord Count: {word_count:,} words")
        
        except Exception as e:
            print(f"Error saving individual chapter {chapter_num}: {e}")
    
    def _update_master_novel_file(self, state: NovelState):
        """Update the master novel file with all completed chapters."""
        try:
            with open("COMPLETE_NOVEL.txt", "w", encoding='utf-8') as f:
                f.write("="*70 + "\n")
                f.write(f"{state.title.upper()}\n")
                f.write("="*70 + "\n")
                f.write(f"Total Chapters Completed: {len([c for c in state.chapters if c.status == 'completed'])}/{state.total_chapters}\n")
                f.write(f"Total Word Count: {sum(c.word_count for c in state.chapters):,} words\n")
                f.write(f"Last Updated: {self._get_current_timestamp()}\n")
                f.write("="*70 + "\n\n")
                
                f.write("TABLE OF CONTENTS\n")
                f.write("-" * 30 + "\n")
                for chapter in state.chapters:
                    status_icon = "✓" if chapter.status == "completed" else "✗"
                    f.write(f"{status_icon} Chapter {chapter.chapter_number:2d} - {chapter.word_count:,} words\n")
                f.write("\n" + "="*70 + "\n")
                
                # Write all chapters
                for chapter in state.chapters:
                    f.write(f"\n\n\nCHAPTER {chapter.chapter_number}\n")
                    f.write("="*70 + "\n\n")
                    f.write(chapter.content)
                    f.write(f"\n\n--- End of Chapter {chapter.chapter_number} ---")
                    if chapter.status == "completed":
                        f.write(f"\nWord Count: {chapter.word_count:,} words")
        
        except Exception as e:
            print(f"Error updating master novel file: {e}")
    
    def _create_novel_summary(self, state: NovelState):
        """Create a summary file with novel statistics and chapter breakdown."""
        try:
            with open("NOVEL_SUMMARY.txt", "w", encoding='utf-8') as f:
                f.write("="*70 + "\n")
                f.write("NOVEL GENERATION SUMMARY\n")
                f.write("="*70 + "\n\n")
                
                f.write(f"Novel Title: {state.title}\n")
                f.write(f"Generation Date: {self._get_current_timestamp()}\n")
                f.write(f"Total Chapters: {state.total_chapters}\n")
                f.write(f"Completed Chapters: {len([c for c in state.chapters if c.status == 'completed'])}\n")
                f.write(f"Failed Chapters: {len([c for c in state.chapters if c.status == 'error'])}\n")
                f.write(f"Total Word Count: {state.total_word_count:,} words\n")
                f.write(f"Average Words per Chapter: {state.total_word_count // len(state.chapters) if state.chapters else 0:,} words\n\n")
                
                f.write("CHAPTER BREAKDOWN\n")
                f.write("-" * 50 + "\n")
                f.write(f"{'Chapter':<10} {'Status':<12} {'Word Count':<12} {'File':<20}\n")
                f.write("-" * 50 + "\n")
                
                for chapter in state.chapters:
                    status_text = "✓ Complete" if chapter.status == "completed" else "✗ Error"
                    filename = f"Chapter_{chapter.chapter_number:02d}.txt"
                    f.write(f"{chapter.chapter_number:<10} {status_text:<12} {chapter.word_count:,} words{'':<5} {filename:<20}\n")
                
                f.write("\n" + "="*70 + "\n")
                f.write("NOVEL STRUCTURE\n")
                f.write("="*70 + "\n\n")
                f.write("Part 1: The Beginning (Chapters 1-5)\n")
                f.write("├─ Chapter 1: Opening Hook\n")
                f.write("├─ Chapter 2: Character Introduction\n")
                f.write("├─ Chapter 3: Supporting Character\n")
                f.write("├─ Chapter 4: Antagonist Introduction\n")
                f.write("└─ Chapter 5: Point of No Return\n\n")
                
                f.write("Part 2: The Journey (Chapters 6-10)\n")
                f.write("├─ Chapter 6: New Territory\n")
                f.write("├─ Chapter 7: Relationship Development\n")
                f.write("├─ Chapter 8: Midpoint Twist\n")
                f.write("├─ Chapter 9: Darkest Hour\n")
                f.write("└─ Chapter 10: Rally\n\n")
                
                f.write("Part 3: The Climax (Chapters 11-15)\n")
                f.write("├─ Chapter 11: Final Approach\n")
                f.write("├─ Chapter 12: Climax Begins\n")
                f.write("├─ Chapter 13: Climax Peak\n")
                f.write("├─ Chapter 14: Aftermath\n")
                f.write("└─ Chapter 15: Resolution\n")
        
        except Exception as e:
            print(f"Error creating novel summary: {e}")
    
    def _create_reading_order_file(self, state: NovelState):
        """Create a file that lists the reading order and file locations."""
        try:
            with open("READING_ORDER.txt", "w", encoding='utf-8') as f:
                f.write("="*70 + "\n")
                f.write("NOVEL READING ORDER\n")
                f.write("="*70 + "\n\n")
                
                f.write("How to Read This Novel:\n")
                f.write("-" * 30 + "\n\n")
                
                f.write("Option 1: Read the Complete Novel\n")
                f.write("└─ Open: COMPLETE_NOVEL.txt\n")
                f.write("   (Contains all chapters in order)\n\n")
                
                f.write("Option 2: Read Individual Chapters\n")
                f.write("└─ Read in this order:\n")
                
                for chapter in state.chapters:
                    if chapter.status == "completed":
                        f.write(f"   {chapter.chapter_number:2d}. chapters/Chapter_{chapter.chapter_number:02d}.txt ({chapter.word_count:,} words)\n")
                    else:
                        f.write(f"   {chapter.chapter_number:2d}. chapters/Chapter_{chapter.chapter_number:02d}.txt (ERROR - SKIP)\n")
                
                f.write("\n" + "="*70 + "\n")
                f.write("QUICK ACCESS COMMANDS\n")
                f.write("="*70 + "\n\n")
                
                f.write("To read specific parts:\n\n")
                f.write("The Beginning (Chapters 1-5):\n")
                for i in range(1, 6):
                    if i <= len(state.chapters) and state.chapters[i-1].status == "completed":
                        f.write(f"- Chapter {i}: chapters/Chapter_{i:02d}.txt\n")
                
                f.write("\nThe Journey (Chapters 6-10):\n")
                for i in range(6, 11):
                    if i <= len(state.chapters) and state.chapters[i-1].status == "completed":
                        f.write(f"- Chapter {i}: chapters/Chapter_{i:02d}.txt\n")
                
                f.write("\nThe Climax (Chapters 11-15):\n")
                for i in range(11, 16):
                    if i <= len(state.chapters) and state.chapters[i-1].status == "completed":
                        f.write(f"- Chapter {i}: chapters/Chapter_{i:02d}.txt\n")
                
                f.write(f"\n\nTotal Reading Time Estimate: {self._estimate_reading_time(state.total_word_count)}\n")
                f.write("(Based on average reading speed of 250 words per minute)\n")
        
        except Exception as e:
            print(f"Error creating reading order file: {e}")
    
    def _estimate_reading_time(self, word_count: int) -> str:
        """Estimate reading time based on word count."""
        minutes = word_count / 250  # Average reading speed
        if minutes < 60:
            return f"{int(minutes)} minutes"
        else:
            hours = minutes / 60
            return f"{hours:.1f} hours"
    
    def _write_chapter(self, state: NovelState, chapter_num: int, description: str, agent: Agent) -> NovelState:
        """Helper method to write a single chapter."""
        print(f"\n--- Writing Chapter {chapter_num} ---")
        
        try:
            # Create context from previous chapters
            context = ""
            if state.chapters:
                context = "Previous chapters context:\n"
                for prev_chapter in state.chapters[-3:]:  # Include last 3 chapters for context
                    context += f"Chapter {prev_chapter.chapter_number} summary: {prev_chapter.content[:500]}...\n\n"
            
            # Create task for this chapter
            task = Task(
                description=f"{context}\n\n{description}",
                agent=agent,
                expected_output=f"Complete Chapter {chapter_num}: 5,000-6,000 words of publication-ready narrative prose."
            )
            
            # Create crew with just this task
            crew = Crew(
                agents=[agent],
                tasks=[task],
                verbose=True,
                process='sequential'
            )
            
            # Execute the task
            result = crew.kickoff()
            
            # Estimate word count (rough approximation)
            word_count = len(str(result).split())
            
            # Save individual chapter file immediately
            self._save_individual_chapter(chapter_num, str(result), word_count)
            
            # Add chapter to state
            chapter_state = ChapterState(
                chapter_number=chapter_num,
                content=str(result),
                word_count=word_count,
                status="completed"
            )
            state.chapters.append(chapter_state)
            
            # Update the master novel file after each chapter
            self._update_master_novel_file(state)
            
            print(f"--- Chapter {chapter_num} completed ({word_count:,} words) ---")
            print(f"--- Chapter {chapter_num} saved to: Chapter_{chapter_num:02d}.txt ---")
            
        except Exception as e:
            print(f"Error writing Chapter {chapter_num}: {e}")
            # Add error chapter to maintain sequence
            error_chapter = ChapterState(
                chapter_number=chapter_num,
                content=f"Error generating Chapter {chapter_num}: {e}",
                word_count=0,
                status="error"
            )
            state.chapters.append(error_chapter)
            
            # Save error chapter file
            self._save_individual_chapter(chapter_num, f"Error generating Chapter {chapter_num}: {e}", 0, is_error=True)
        
        return state
    
    @start()
    def initialize_novel(self) -> NovelState:
        """Initialize the novel writing process."""
        print("\n" + "="*70)
        print("INITIALIZING NOVEL WRITING FLOW")
        print("="*70)
        print("\nThis will generate:")
        print("- 15 complete chapters (not summaries)")
        print("- 5,000-6,000 words per chapter")
        print("- 75,000-90,000 total words")
        print("- Full narrative prose as readers would read it")
        print("="*70 + "\n")
        
        return NovelState()
    
    @listen(initialize_novel)
    def write_opening_chapters(self, state: NovelState) -> NovelState:
        """Write chapters 1-5: The Beginning."""
        print("\n--- PART 1: THE BEGINNING (Chapters 1-5) ---\n")
        
        chapter_descriptions = {
            1: """Write the COMPLETE Chapter 1 of the novel (5,000-6,000 words of actual narrative prose).

            Start with a compelling first line that hooks readers immediately. Introduce the protagonist through action, not description. 
            Establish the world through sensory details and experience. Include at least 3 dialogue exchanges that reveal character and conflict.
            
            This is the ACTUAL CHAPTER 1 that readers will read, not an outline. Write it like the opening of a bestselling novel.
            
            Example of the quality expected:
            "The memory thief's fingers trembled as she held the glass vial up to the flickering streetlight. Inside, silver mist swirled like 
            trapped moonlight—someone's first kiss, if the label was honest. But labels were never honest in the Lower Quarter, and Elara Rivers 
            had built her reputation on knowing the difference between what memories claimed to be and what they truly were..."
            
            WRITE THE COMPLETE CHAPTER WITH FULL SCENES, DIALOGUE, AND NARRATIVE.""",
            
            2: """Write the COMPLETE Chapter 2 of the novel (5,000-6,000 words of actual narrative prose).
            
            Continue directly from Chapter 1. Deepen the conflict introduced. Reveal more about the protagonist through their actions and choices.
            Include a scene showing the protagonist's daily life interrupted by the growing threat.
            
            Include:
            - A scene showing the protagonist's unique skills/abilities
            - A conversation that hints at their backstory without info-dumping
            - A moment of vulnerability that humanizes them
            - An action sequence that raises the stakes""",
            
            3: """Write the COMPLETE Chapter 3 of the novel (5,000-6,000 words of actual narrative prose).
            
            Introduce a major supporting character through a memorable scene. This character should challenge the protagonist in some way.
            
            Include:
            - The supporting character's entrance (make it memorable)
            - A dialogue exchange that shows the dynamic between them and the protagonist
            - A flashback scene (500-700 words) revealing crucial backstory
            - A plot development that changes the protagonist's understanding of their situation""",
            
            4: """Write the COMPLETE Chapter 4 of the novel (5,000-6,000 words of actual narrative prose).
            
            Introduce the antagonist or main opposing force. Make them compelling and three-dimensional.
            
            Include:
            - The antagonist's introduction scene (from their POV or through their actions)
            - A speech or monologue that reveals their worldview and motivations
            - A demonstration of their power/influence
            - The moment the protagonist realizes the true scope of the threat""",
            
            5: """Write the COMPLETE Chapter 5 of the novel (5,000-6,000 words of actual narrative prose).
            
            The point of no return. Write the scene where the protagonist must commit to their journey.
            
            Include:
            - A scene showing what the protagonist stands to lose
            - A powerful dialogue exchange with someone trying to stop them
            - An action sequence where they cross the line
            - A quiet moment afterward showing the weight of their choice"""
        }
        
        for chapter_num in range(1, 6):
            state = self._write_chapter(state, chapter_num, chapter_descriptions[chapter_num], self.novel_writer)
        
        return state
    
    @listen(write_opening_chapters)
    def write_journey_chapters(self, state: NovelState) -> NovelState:
        """Write chapters 6-10: The Journey."""
        print("\n--- PART 2: THE JOURNEY (Chapters 6-10) ---\n")
        
        chapter_descriptions = {
            6: """Write the COMPLETE Chapter 6 of the novel (5,000-6,000 words of actual narrative prose).
            
            The protagonist enters unfamiliar territory (literally or figuratively). Show them struggling with new challenges.
            
            Include:
            - A scene in a completely new setting, richly described
            - An encounter that tests the protagonist's abilities
            - A moment where they fail and must adapt
            - New ally or enemy introduction""",
            
            7: """Write the COMPLETE Chapter 7 of the novel (5,000-6,000 words of actual narrative prose).
            
            Deepen relationships. Show how characters change each other through extended interaction.
            
            Include:
            - An extended dialogue scene revealing character depths
            - A shared danger that forces characters to trust each other
            - A moment of unexpected vulnerability
            - A revelation about one character's past that changes everything""",
            
            8: """Write the COMPLETE Chapter 8 of the novel (5,000-6,000 words of actual narrative prose).
            
            The midpoint twist. Everything the protagonist believed is challenged.
            
            Include:
            - A shocking revelation that reframes the entire conflict
            - A betrayal or unexpected alliance
            - An action sequence with serious consequences
            - A character making a sacrifice""",
            
            9: """Write the COMPLETE Chapter 9 of the novel (5,000-6,000 words of actual narrative prose).
            
            The darkest hour begins. Things go terribly wrong.
            
            Include:
            - A devastating failure or loss
            - Characters turning against each other under pressure
            - A scene showing the antagonist winning
            - A moment of despair where giving up seems logical""",
            
            10: """Write the COMPLETE Chapter 10 of the novel (5,000-6,000 words of actual narrative prose).
            
            The rally. From the ashes of defeat, hope emerges.
            
            Include:
            - A powerful speech or moment of inspiration
            - Characters reconciling and recommitting
            - A new plan formed from lessons learned
            - A scene showing character growth through action"""
        }
        
        for chapter_num in range(6, 11):
            agent = self.character_development if chapter_num in [7, 10] else self.novel_writer
            state = self._write_chapter(state, chapter_num, chapter_descriptions[chapter_num], agent)
        
        return state
    
    @listen(write_journey_chapters)
    def write_climax_chapters(self, state: NovelState) -> NovelState:
        """Write chapters 11-15: The Climax."""
        print("\n--- PART 3: THE CLIMAX (Chapters 11-15) ---\n")
        
        chapter_descriptions = {
            11: """Write the COMPLETE Chapter 11 of the novel (5,000-6,000 words of actual narrative prose).
            
            The final approach. Characters prepare for the ultimate confrontation.
            
            Include:
            - Final preparations and strategy
            - Characters addressing unfinished business
            - A last moment of calm before the storm
            - The beginning of the final conflict""",
            
            12: """Write the COMPLETE Chapter 12 of the novel (5,000-6,000 words of actual narrative prose).
            
            The climax begins. All forces collide.
            
            Include:
            - The protagonist confronting the antagonist
            - Multiple plot threads converging
            - High-stakes action with serious consequences
            - Revelations that change everything""",
            
            13: """Write the COMPLETE Chapter 13 of the novel (5,000-6,000 words of actual narrative prose).
            
            The climax peaks. The ultimate confrontation with everything at stake.
            
            Include:
            - The final battle/confrontation in all its complexity
            - Characters making ultimate sacrifices
            - The protagonist's darkest and finest moment
            - The moment of triumph or tragedy""",
            
            14: """Write the COMPLETE Chapter 14 of the novel (5,000-6,000 words of actual narrative prose).
            
            The immediate aftermath. Show the cost of victory (or defeat).
            
            Include:
            - Characters dealing with losses
            - The new status quo emerging
            - Emotional reunions or farewells
            - Seeds of what comes next""",
            
            15: """Write the COMPLETE FINAL Chapter 15 of the novel (5,000-6,000 words of actual narrative prose).
            
            The resolution. Show how characters and the world have changed.
            
            Include:
            - Where each major character ends up
            - How the world has changed
            - A callback to the beginning showing growth
            - A final scene that resonates emotionally
            - A last line that readers will never forget
            
            End with a powerful last line that stays with readers."""
        }
        
        for chapter_num in range(11, 16):
            state = self._write_chapter(state, chapter_num, chapter_descriptions[chapter_num], self.novel_writer)
        
        return state
    
    @listen(write_climax_chapters)
    def finalize_novel(self, state: NovelState) -> NovelState:
        """Finalize the novel and save it to file."""
        print("\n--- FINALIZING NOVEL ---\n")
        
        # Calculate total word count
        state.total_word_count = sum(chapter.word_count for chapter in state.chapters)
        
        # Final update to master novel file
        self._update_master_novel_file(state)
        
        # Create a summary file
        self._create_novel_summary(state)
        
        # Create a reading order file
        self._create_reading_order_file(state)
        
        print("\n" + "="*70)
        print("NOVEL WRITING COMPLETE!")
        print("="*70)
        print(f"\nYour complete novel has been saved in multiple formats:")
        print(f"📁 Individual chapters: chapters/Chapter_01.txt to chapters/Chapter_15.txt")
        print(f"📖 Complete novel: COMPLETE_NOVEL.txt")
        print(f"📋 Novel summary: NOVEL_SUMMARY.txt")
        print(f"📚 Reading order: READING_ORDER.txt")
        print(f"\nNovel Statistics:")
        print(f"├─ Total chapters: {len(state.chapters)}")
        print(f"├─ Completed chapters: {len([c for c in state.chapters if c.status == 'completed'])}")
        print(f"├─ Failed chapters: {len([c for c in state.chapters if c.status == 'error'])}")
        print(f"└─ Total word count: {state.total_word_count:,} words")
        print("\nFile Structure:")
        print("├─ chapters/")
        print("│   ├─ Chapter_01.txt")
        print("│   ├─ Chapter_02.txt")
        print("│   └─ ... (through Chapter_15.txt)")
        print("├─ COMPLETE_NOVEL.txt")
        print("├─ NOVEL_SUMMARY.txt")
        print("└─ READING_ORDER.txt")
        print("="*70)
        
        return state

# ============= EXECUTION FUNCTION =============

def write_novel_with_flows():
    """Execute the novel writing flow."""
    print("="*70)
    print("COMPLETE NOVEL GENERATOR - USING CREWAI FLOWS")
    print("="*70)
    print("\nThis will write an ENTIRE NOVEL using CrewAI Flows - not an outline, not a summary,")
    print("but every single chapter as readers would read it in a published book.")
    print("\nExpected output: A complete 75,000-90,000 word novel")
    print("Time estimate: This will take some time due to the length")
    print("-" * 70 + "\n")
    
    input("Press Enter to begin writing the complete novel using Flows...")
    
    # Create and run the flow
    flow = NovelWritingFlow()
    result = flow.kickoff()
    
    return result

# ============= MAIN EXECUTION =============

if __name__ == "__main__":
    final_state = write_novel_with_flows()
    print(f"\nNovel generation completed with {len(final_state.chapters)} chapters!")