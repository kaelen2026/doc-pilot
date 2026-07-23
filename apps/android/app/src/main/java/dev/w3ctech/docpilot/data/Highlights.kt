package dev.w3ctech.docpilot.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import kotlinx.coroutines.flow.Flow

@Entity(
  tableName = "highlights",
  primaryKeys = ["userId", "documentId", "page"],
)
data class HighlightEntity(
  val userId: String,
  val documentId: String,
  val page: Int,
  val createdAt: Long = System.currentTimeMillis(),
)

@Dao
interface HighlightDao {
  @Query("SELECT * FROM highlights WHERE userId = :userId AND documentId = :documentId ORDER BY page")
  fun observe(userId: String, documentId: String): Flow<List<HighlightEntity>>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun put(value: HighlightEntity)

  @Query("DELETE FROM highlights WHERE userId = :userId")
  suspend fun deleteUser(userId: String)
}

@Database(entities = [HighlightEntity::class], version = 1, exportSchema = false)
abstract class DocPilotDatabase : RoomDatabase() {
  abstract fun highlights(): HighlightDao

  companion object {
    fun create(context: Context) = Room.databaseBuilder(
      context,
      DocPilotDatabase::class.java,
      "docpilot.db",
    ).build()
  }
}
